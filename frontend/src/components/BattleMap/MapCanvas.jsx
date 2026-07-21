import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Transformer } from 'react-konva';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import { useRoomStore } from '../../store/useRoomStore';
import { api, API_BASE } from '../../api/client';
import { getSocket } from '../../api/socket';
import { throttle } from '../../utils/throttle';
import { pushPendingRollLabel } from '../../utils/pendingRollLabels';
import TokenNode from './TokenNode';
import AoeShape, { RangeRing } from './AoeShape';

const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

export default function MapCanvas({ roomId, canMoveToken, onDropTemplate }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const tokenRefs = useRef({});
  const lastWorldPos = useRef({ x: 0, y: 0 }); // для вставки картинки — не требует ре-рендера
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState(null);
  const [cursorWorld, setCursorWorld] = useState(null); // для отрисовки собственного превью прицеливания

  const tokens = useBattleMapStore((s) => s.tokens);
  const gridSize = useBattleMapStore((s) => s.gridSize);
  const mapWidth = useBattleMapStore((s) => s.width);
  const mapHeight = useBattleMapStore((s) => s.height);
  const mapId = useBattleMapStore((s) => s.mapId);
  const moveTokenLive = useBattleMapStore((s) => s.moveTokenLive);
  const commitTokenTransform = useBattleMapStore((s) => s.commitTokenTransform);
  const removeToken = useBattleMapStore((s) => s.removeToken);
  const controlledTokenId = useBattleMapStore((s) => s.controlledTokenId);
  const activeAction = useBattleMapStore((s) => s.activeAction);
  const setActiveAction = useBattleMapStore((s) => s.setActiveAction);
  const clearTargetPreview = useBattleMapStore((s) => s.clearTargetPreview);
  const remoteTargetPreviews = useBattleMapStore((s) => s.remoteTargetPreviews);

  const casterToken = controlledTokenId ? tokens[controlledTokenId] : null;

  // вьюпорт подстраивается под контейнер — карта на весь экран
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setViewport({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!transformerRef.current) return;
    const node = selectedId ? tokenRefs.current[selectedId] : null;
    transformerRef.current.nodes(node ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, tokens]);

  // Delete/Backspace — удаление, Escape — отмена прицеливания. Право
  // удалять — то же самое право двигать токен (сервер перепроверит сам).
  useEffect(() => {
    function handleKeyDown(e) {
      const active = document.activeElement;
      const isEditingField = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

      if (e.key === 'Escape' && activeAction) {
        clearTargetPreview(roomId, activeAction.characterId);
        setActiveAction(null);
        return;
      }
      if (isEditingField) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedId) return;
      const token = tokens[selectedId];
      if (!token || !canMoveToken(token)) return;
      if (!window.confirm('Удалить токен с карты?')) return;
      removeToken(roomId, selectedId);
      setSelectedId(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, tokens, canMoveToken, roomId, removeToken, activeAction, clearTargetPreview, setActiveAction]);

  // Вставка картинки по Ctrl+V — в обход системы представлений, это про
  // "быстро добавить картинку", а не "сохранить переиспользуемую заготовку".
  useEffect(() => {
    async function handlePaste(e) {
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
      if (!mapId) return;

      const items = [...(e.clipboardData?.items || [])];
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;

      const blob = imageItem.getAsFile();
      if (!blob) return;

      const formData = new FormData();
      formData.append('file', blob, 'pasted.png');
      try {
        const { url } = await api.postForm(`/rooms/${roomId}/images`, formData);
        getSocket().emit('token_add', {
          room_id: roomId, battle_map_id: mapId, image_url: `${API_ORIGIN}${url}`,
          pos_x: lastWorldPos.current.x, pos_y: lastWorldPos.current.y, width: 60, height: 60,
        });
      } catch (err) {
        console.error('Не удалось загрузить вставленную картинку', err);
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [roomId, mapId]);

  // стейдж может быть подвинут (панорамирование) и масштабирован (зум) —
  // getPointerPosition() отдаёт сырые координаты без поправки на это
  function toWorld(clientX, clientY) {
    const stage = stageRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    const scale = stage.scaleX();
    return {
      x: (clientX - rect.left - stage.x()) / scale,
      y: (clientY - rect.top - stage.y()) / scale,
    };
  }

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    let newScale = direction > 0 ? oldScale * 1.05 : oldScale / 1.05;
    newScale = Math.max(0.2, Math.min(3, newScale));

    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
    stage.batchDraw();
  }

  // троттлинг создан один раз (useRef) — актуальные activeAction/roomId
  // читает из стора в момент вызова, а не по замыканию на момент
  // создания, поэтому не протухает при смене активного действия
  const throttledCursorUpdate = useRef(throttle((worldPos, currentRoomId) => {
    setCursorWorld(worldPos);
    const action = useBattleMapStore.getState().activeAction;
    if (action) {
      useBattleMapStore.getState().broadcastTargetPreview(
        currentRoomId, action.characterId, action.data.name, worldPos.x, worldPos.y, action.data.aoe || null,
      );
    }
  }, 50)).current;

  function handleMouseMove() {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scale = stage.scaleX();
    const world = { x: (pointer.x - stage.x()) / scale, y: (pointer.y - stage.y()) / scale };
    lastWorldPos.current = world;
    throttledCursorUpdate(world, roomId);
  }

  function confirmTarget() {
    const action = activeAction;
    if (!action) return;
    clearTargetPreview(roomId, action.characterId);
    setActiveAction(null);
    // Подпись — результат броска костей действия, а не точка/цель: где именно
    // прицелились, уже видно по превью AoE на карте. Если в действии нет
    // костей (контрзаклинание и т.п.), rollFormula пуст и бросать нечего.
    if (!action.rollFormula) return;
    pushPendingRollLabel(action.data.name);
    useRoomStore.getState().rollDice(action.rollFormula, action.characterId);
  }

  function handleStageClick(e) {
    if (e.target !== stageRef.current) return; // клик по токену обработает сам токен
    if (activeAction) {
      confirmTarget();
      return;
    }
    setSelectedId(null);
  }

  function handleTokenClick(token) {
    if (activeAction) {
      confirmTarget();
      return;
    }
    setSelectedId(token.id);
    // выбор токена персонажа, которым имею право управлять, заодно делает
    // его подконтрольным для хотбара — то же действие, без отдельного шага
    if (token.character_id && canMoveToken(token)) {
      useBattleMapStore.getState().setControlled(token.id, token.character_id);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const templateId = e.dataTransfer.getData('text/template-id');
    if (!templateId) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    onDropTemplate(parseInt(templateId, 10), x, y);
  }

  const gridLines = [];
  for (let x = 0; x <= mapWidth; x += gridSize) {
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, mapHeight]} stroke="#3a4150" strokeWidth={1} />);
  }
  for (let y = 0; y <= mapHeight; y += gridSize) {
    gridLines.push(<Line key={`h${y}`} points={[0, y, mapWidth, y]} stroke="#3a4150" strokeWidth={1} />);
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', cursor: activeAction ? 'crosshair' : 'default' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        draggable={!activeAction}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
      >
        <Layer>{gridLines}</Layer>
        <Layer>
          {Object.values(tokens).map((token) => (
            <TokenNode
              key={token.id}
              token={token}
              shapeRef={(node) => { if (node) tokenRefs.current[token.id] = node; }}
              canMove={canMoveToken(token) && !activeAction}
              onSelect={() => handleTokenClick(token)}
              onDragMove={(id, x, y) => moveTokenLive(roomId, id, x, y)}
              onDragEnd={(id, x, y) => commitTokenTransform(roomId, id, { pos_x: x, pos_y: y })}
              onTransformEnd={(id, node) => {
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                commitTokenTransform(roomId, id, {
                  pos_x: node.x(),
                  pos_y: node.y(),
                  rotation: node.rotation(),
                  width: Math.max(10, (token.width || 50) * scaleX),
                  height: Math.max(10, (token.height || 50) * scaleY),
                });
              }}
            />
          ))}
          <Transformer
            ref={transformerRef}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20 ? oldBox : newBox)}
          />
        </Layer>

        {/* превью прицеливания — своё и чужих, отдельным верхним слоем,
            listening=false чтобы фигуры не перехватывали клики по токенам */}
        <Layer listening={false}>
          {activeAction && cursorWorld && (
            <>
              <RangeRing
                casterX={casterToken?.pos_x} casterY={casterToken?.pos_y}
                rangeFeet={activeAction.data.range} gridSize={gridSize}
              />
              <AoeShape
                aoe={activeAction.data.aoe}
                casterX={casterToken?.pos_x} casterY={casterToken?.pos_y}
                targetX={cursorWorld.x} targetY={cursorWorld.y}
                gridSize={gridSize} fill="rgba(108,127,216,0.2)" stroke="#6c7fd8"
              />
            </>
          )}
          {Object.entries(remoteTargetPreviews).map(([characterId, preview]) => {
            const remoteCaster = Object.values(tokens).find(
              (t) => t.character_id === parseInt(characterId, 10) && !t.is_instance,
            );
            return (
              <AoeShape
                key={characterId}
                aoe={preview.aoe}
                casterX={remoteCaster?.pos_x} casterY={remoteCaster?.pos_y}
                targetX={preview.targetX} targetY={preview.targetY}
                gridSize={gridSize} fill="rgba(136,136,136,0.15)" stroke="#888"
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
