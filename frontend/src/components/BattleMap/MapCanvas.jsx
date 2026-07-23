import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Transformer, Label, Tag } from 'react-konva';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import { useRoomStore } from '../../store/useRoomStore';
import { api, API_ORIGIN } from '../../api/client';
import { getSocket } from '../../api/socket';
import { throttle } from '../../utils/throttle';
import { toFeet } from '../../utils/scale';
import { pushPendingRollLabel } from '../../utils/pendingRollLabels';
import TokenNode from './TokenNode';
import FogShapeNode from './FogShapeNode';
import AoeShape, { RangeRing } from './AoeShape';
import TokenActionPanel from './TokenActionPanel';

export default function MapCanvas({ roomId, isGm, canMoveToken, canManageToken, onDropTemplate }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const tokenRefs = useRef({});
  const fogTransformerRef = useRef(null);
  const fogShapeRefs = useRef({});
  const lastWorldPos = useRef({ x: 0, y: 0 }); // для вставки картинки — не требует ре-рендера
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState(null);
  // экранная проекция трансформации стейджа (пан/зум) — нужна только чтобы
  // держать плавающую HTML-панель действий токена на месте поверх канваса;
  // сам канвас читает x/y/scale стейджа напрямую и в этом стейте не нуждается
  const [stageTransform, setStageTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [cursorWorld, setCursorWorld] = useState(null); // для отрисовки собственного превью прицеливания
  const [rulerStart, setRulerStart] = useState(null); // world-точка зажатия в режиме линейки
  const [rulerEnd, setRulerEnd] = useState(null);
  const [pointerTrail, setPointerTrail] = useState([]); // собственный "хвост кометы" в режиме указателя
  const [fogDrawStart, setFogDrawStart] = useState(null); // world-точка зажатия при рисовании тумана
  const [fogDrawRect, setFogDrawRect] = useState(null); // { x, y, width, height } — live-превью рисуемой рамки
  const [selectedFogId, setSelectedFogId] = useState(null);
  const isPointerDown = useRef(false);
  const isMiddlePanning = useRef(false); // панорамирование средней кнопкой — работает в любом режиме
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const hasCenteredRef = useRef(false); // чтобы не сбрасывать панораму игрока при каждом ресайзе
  const remotePointerTrails = useRef({}); // { [userId]: [{x,y}, ...] } — буфер хвостов чужих указателей
  const [, setRemoteTrailTick] = useState(0); // форс ре-рендер при обновлении буфера выше (он вне React state)

  const tokens = useBattleMapStore((s) => s.tokens);
  const gridSize = useBattleMapStore((s) => s.gridSize);
  const mapWidth = useBattleMapStore((s) => s.width);
  const mapHeight = useBattleMapStore((s) => s.height);
  const mapId = useBattleMapStore((s) => s.mapId);
  const moveTokenLive = useBattleMapStore((s) => s.moveTokenLive);
  const commitTokenTransform = useBattleMapStore((s) => s.commitTokenTransform);
  const removeToken = useBattleMapStore((s) => s.removeToken);
  const setTokenLocked = useBattleMapStore((s) => s.setTokenLocked);
  const setTokenLayer = useBattleMapStore((s) => s.setTokenLayer);
  const setTokenConditions = useBattleMapStore((s) => s.setTokenConditions);
  const controlledTokenId = useBattleMapStore((s) => s.controlledTokenId);
  const activeAction = useBattleMapStore((s) => s.activeAction);
  const setActiveAction = useBattleMapStore((s) => s.setActiveAction);
  const clearTargetPreview = useBattleMapStore((s) => s.clearTargetPreview);
  const remoteTargetPreviews = useBattleMapStore((s) => s.remoteTargetPreviews);
  const activeTool = useBattleMapStore((s) => s.activeTool);
  const remotePointers = useBattleMapStore((s) => s.remotePointers);
  const fogShapes = useBattleMapStore((s) => s.fogShapes);
  const fogDrawShapeType = useBattleMapStore((s) => s.fogDrawShapeType);
  const addFogShape = useBattleMapStore((s) => s.addFogShape);
  const moveFogShapeLive = useBattleMapStore((s) => s.moveFogShapeLive);
  const commitFogShapeTransform = useBattleMapStore((s) => s.commitFogShapeTransform);
  const removeFogShape = useBattleMapStore((s) => s.removeFogShape);

  const casterToken = controlledTokenId ? tokens[controlledTokenId] : null;
  const selectedToken = selectedId ? tokens[selectedId] : null;
  // панель действий видна, только если это свой токен или GM (см.
  // canManageToken в BattleMapView) — та же проверка, что и на бэкенде у
  // token_update_props, тут лишь чтобы не рисовать кнопки, которые сервер
  // всё равно отклонит
  const showTokenPanel = !!(selectedToken && canManageToken && canManageToken(selectedToken));

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

  // при заходе на карту камера по умолчанию должна смотреть в центр сетки,
  // а не в её левый верхний угол (нулевая позиция Stage); центрируем один
  // раз, пока не подвинута игроком, и заново — при смене карты
  useEffect(() => {
    hasCenteredRef.current = false;
  }, [mapId]);

  useEffect(() => {
    if (hasCenteredRef.current) return;
    const stage = stageRef.current;
    if (!stage || !mapWidth || !mapHeight || !viewport.width || !viewport.height) return;
    stage.position({
      x: (viewport.width - mapWidth * stage.scaleX()) / 2,
      y: (viewport.height - mapHeight * stage.scaleY()) / 2,
    });
    stage.batchDraw();
    hasCenteredRef.current = true;
    syncStageTransform();
  }, [viewport, mapWidth, mapHeight, mapId]);

  // при смене инструмента — сбросить незавершённую линейку/указатель; если
  // указатель транслировался, сообщить остальным, что он убран
  useEffect(() => {
    setRulerStart(null);
    setRulerEnd(null);
    setFogDrawStart(null);
    setFogDrawRect(null);
    setSelectedFogId(null);
    if (isPointerDown.current) {
      isPointerDown.current = false;
      setPointerTrail([]);
      useBattleMapStore.getState().clearPointer(roomId);
    }
  }, [activeTool, roomId]);

  // локальный буфер последних позиций каждого чужого указателя — стор хранит
  // только самую свежую точку, "хвост кометы" собираем здесь же
  useEffect(() => {
    Object.entries(remotePointers).forEach(([userId, pos]) => {
      const buf = remotePointerTrails.current[userId] || [];
      buf.push({ x: pos.x, y: pos.y });
      if (buf.length > 6) buf.shift();
      remotePointerTrails.current[userId] = buf;
    });
    Object.keys(remotePointerTrails.current).forEach((userId) => {
      if (!remotePointers[userId]) delete remotePointerTrails.current[userId];
    });
    setRemoteTrailTick((t) => t + 1);
  }, [remotePointers]);

  useEffect(() => {
    if (!transformerRef.current) return;
    const node = selectedId ? tokenRefs.current[selectedId] : null;
    transformerRef.current.nodes(node ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, tokens]);

  useEffect(() => {
    if (!fogTransformerRef.current) return;
    const node = selectedFogId ? fogShapeRefs.current[selectedFogId] : null;
    fogTransformerRef.current.nodes(node ? [node] : []);
    fogTransformerRef.current.getLayer()?.batchDraw();
  }, [selectedFogId, fogShapes]);

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

      if (activeTool === 'fog' && selectedFogId) {
        if (!isGm) return;
        if (!window.confirm('Удалить фигуру тумана войны?')) return;
        removeFogShape(roomId, selectedFogId);
        setSelectedFogId(null);
        return;
      }

      if (!selectedId) return;
      const token = tokens[selectedId];
      if (!token || !canMoveToken(token)) return;
      if (!window.confirm('Удалить токен с карты?')) return;
      removeToken(roomId, selectedId);
      setSelectedId(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, tokens, canMoveToken, roomId, removeToken, activeAction, clearTargetPreview, setActiveAction, activeTool, selectedFogId, isGm, removeFogShape]);

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

  // синхронизирует стейт с фактической трансформацией стейджа — та обычно
  // двигается императивно (Konva drag, wheel-зум) в обход React ради 60fps,
  // так что панели, привязанной к экранным координатам токена, неоткуда
  // больше узнать о пане/зуме
  function syncStageTransform() {
    const stage = stageRef.current;
    if (!stage) return;
    setStageTransform({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
  }

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
    syncStageTransform();
  }

  // троттлинг создан один раз (useRef) — актуальные activeAction/roomId
  // читает из стора в момент вызова, а не по замыканию на момент
  // создания, поэтому не протухает при смене активного действия
  //
  // троттлится только сетевая рассылка остальным участникам; собственное
  // превью (setCursorWorld) обновляется нетроттлированно в handleMouseMove,
  // тем же принципом, что и собственный "хвост" указателя ниже
  const throttledTargetPreviewUpdate = useRef(throttle((worldPos, currentRoomId) => {
    const action = useBattleMapStore.getState().activeAction;
    if (action) {
      useBattleMapStore.getState().broadcastTargetPreview(
        currentRoomId, action.characterId, action.data.name, worldPos.x, worldPos.y, action.data.aoe || null,
      );
    }
  }, 50)).current;

  // трансляция собственного указателя остальным — троттлится так же, как
  // и превью прицеливания; собственный "хвост" при этом обновляется
  // локально безо всякого троттлинга, чтобы вести себя плавно
  const throttledPointerUpdate = useRef(throttle((worldPos, currentRoomId) => {
    useBattleMapStore.getState().broadcastPointerMove(currentRoomId, worldPos.x, worldPos.y);
  }, 50)).current;

  function getPointerWorld() {
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const scale = stage.scaleX();
    return { x: (pointer.x - stage.x()) / scale, y: (pointer.y - stage.y()) / scale };
  }

  // привязка точки к центру клетки сетки — используется для старта линейки
  function snapToCellCenter(point, cellSize) {
    if (!cellSize) return point;
    return {
      x: Math.floor(point.x / cellSize) * cellSize + cellSize / 2,
      y: Math.floor(point.y / cellSize) * cellSize + cellSize / 2,
    };
  }

  function handleMouseMove(e) {
    if (isMiddlePanning.current) {
      const dx = e.evt.clientX - lastPanPoint.current.x;
      const dy = e.evt.clientY - lastPanPoint.current.y;
      lastPanPoint.current = { x: e.evt.clientX, y: e.evt.clientY };
      const stage = stageRef.current;
      stage.position({ x: stage.x() + dx, y: stage.y() + dy });
      stage.batchDraw();
      syncStageTransform();
      return;
    }

    const world = getPointerWorld();
    if (!world) return;
    lastWorldPos.current = world;
    setCursorWorld(world);
    throttledTargetPreviewUpdate(world, roomId);

    if (activeTool === 'ruler' && rulerStart) {
      const dx = world.x - rulerStart.x;
      const dy = world.y - rulerStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // шаг линейки — целое число клеток (5 фт за клетку), а не плавная длина
      const steppedDist = gridSize ? Math.round(dist / gridSize) * gridSize : dist;
      if (dist === 0 || steppedDist === 0) {
        setRulerEnd(rulerStart);
      } else {
        setRulerEnd({
          x: rulerStart.x + (dx / dist) * steppedDist,
          y: rulerStart.y + (dy / dist) * steppedDist,
        });
      }
    } else if (activeTool === 'pointer' && isPointerDown.current) {
      setPointerTrail((trail) => [...trail, world].slice(-6));
      throttledPointerUpdate(world, roomId);
    } else if (activeTool === 'fog' && fogDrawStart) {
      setFogDrawRect({
        x: Math.min(fogDrawStart.x, world.x),
        y: Math.min(fogDrawStart.y, world.y),
        width: Math.abs(world.x - fogDrawStart.x),
        height: Math.abs(world.y - fogDrawStart.y),
      });
    }
  }

  // средняя кнопка панорамирует карту независимо от выбранного режима
  // курсора (линейка/указатель тоже используют зажатую мышь, но только
  // левую кнопку — конфликта нет)
  function handleStageMouseDown(e) {
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      isMiddlePanning.current = true;
      lastPanPoint.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    if (e.evt.button !== 0) return;
    if (activeAction) return; // прицеливание заклинанием обрабатывается кликом, не влезаем
    if (activeTool === 'ruler') {
      const world = getPointerWorld();
      if (!world) return;
      const start = snapToCellCenter(world, gridSize);
      setRulerStart(start);
      setRulerEnd(start);
    } else if (activeTool === 'pointer') {
      const world = getPointerWorld();
      if (!world) return;
      isPointerDown.current = true;
      setPointerTrail([world]);
      throttledPointerUpdate(world, roomId);
    } else if (activeTool === 'fog' && isGm) {
      // рисуем новую фигуру только по клику на пустое место стейджа;
      // клик по существующей фигуре — это её собственный выбор/драг,
      // не начало новой рамки
      if (e.target !== stageRef.current) return;
      const world = getPointerWorld();
      if (!world) return;
      setSelectedFogId(null);
      setFogDrawStart(world);
      setFogDrawRect({ x: world.x, y: world.y, width: 0, height: 0 });
    }
  }

  function handleStageMouseUp() {
    if (isMiddlePanning.current) {
      isMiddlePanning.current = false;
      return;
    }
    if (activeTool === 'ruler') {
      setRulerStart(null);
      setRulerEnd(null);
    } else if (activeTool === 'pointer' && isPointerDown.current) {
      isPointerDown.current = false;
      setPointerTrail([]);
      useBattleMapStore.getState().clearPointer(roomId);
    } else if (activeTool === 'fog' && fogDrawStart) {
      if (fogDrawRect && fogDrawRect.width > 10 && fogDrawRect.height > 10) {
        addFogShape(roomId, mapId, {
          shapeType: fogDrawShapeType,
          x: fogDrawRect.x, y: fogDrawRect.y,
          width: fogDrawRect.width, height: fogDrawRect.height,
        });
      }
      setFogDrawStart(null);
      setFogDrawRect(null);
    }
  }

  // отпускание кнопки мыши за пределами Stage (например, курсор увели с
  // канваса) должно так же завершать панорамирование/линейку/указатель
  useEffect(() => {
    window.addEventListener('mouseup', handleStageMouseUp);
    return () => window.removeEventListener('mouseup', handleStageMouseUp);
  }, [activeTool, roomId, fogDrawStart, fogDrawRect, fogDrawShapeType, mapId]);

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
    if (e.evt.button !== 0) return; // средняя/правая кнопка — не клик по карте
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
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, mapHeight]} stroke="#72747d" strokeWidth={1} />);
  }
  for (let y = 0; y <= mapHeight; y += gridSize) {
    gridLines.push(<Line key={`h${y}`} points={[0, y, mapWidth, y]} stroke="#72747d" strokeWidth={1} />);
  }

  // сетка рисуется отдельным слоем МЕЖДУ токенами фона (карта/декорация,
  // layer < 10) и обычными токенами/эффектами (layer >= 10) — иначе сетка
  // как один Konva.Layer всегда оказывалась бы либо целиком под, либо
  // целиком над токенами независимо от их layer, и токен со слоем "Карта"
  // всё равно рисовался бы поверх линий
  const sortedTokens = Object.values(tokens).sort((a, b) => (a.layer ?? 10) - (b.layer ?? 10));
  const backgroundTokens = sortedTokens.filter((t) => (t.layer ?? 10) < 10);
  const foregroundTokens = sortedTokens.filter((t) => (t.layer ?? 10) >= 10);

  function renderTokenNode(token) {
    return (
      <TokenNode
        key={token.id}
        token={token}
        shapeRef={(node) => { if (node) tokenRefs.current[token.id] = node; }}
        canMove={canMoveToken(token) && !activeAction && activeTool === 'pan'}
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
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: (activeAction || activeTool !== 'pan') ? 'crosshair' : 'default' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        draggable={activeTool === 'pan' && !activeAction}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleMouseMove}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onDragMove={syncStageTransform}
        onDragEnd={syncStageTransform}
      >
        <Layer>{backgroundTokens.map(renderTokenNode)}</Layer>
        <Layer>{gridLines}</Layer>
        <Layer>
          {foregroundTokens.map(renderTokenNode)}
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

          {/* линейка — только локально, видит лишь тот, кто ей пользуется */}
          {activeTool === 'ruler' && rulerStart && rulerEnd && (() => {
            const dx = rulerEnd.x - rulerStart.x;
            const dy = rulerEnd.y - rulerStart.y;
            const rawFeet = toFeet(Math.sqrt(dx * dx + dy * dy), gridSize);
            const feet = Math.round(rawFeet / 5) * 5;
            return (
              <>
                <Line points={[rulerStart.x, rulerStart.y, rulerEnd.x, rulerEnd.y]} stroke="#f6f7f9" strokeWidth={4} dash={[6, 4]} />
                <Circle x={rulerStart.x} y={rulerStart.y} radius={4} fill="#2f6fed" />
                <Label x={(rulerStart.x + rulerEnd.x) / 2 + 8} y={(rulerStart.y + rulerEnd.y) / 2 - 8}>
                  <Tag fill="#1a1a1f" opacity={0.75} cornerRadius={4} />
                  <Text
                    text={`${feet} фт`} fontSize={16} fontStyle="bold" fill="#f6f8fa"
                    padding={4}
                  />
                </Label>
              </>
            );
          })()}

          {/* собственный указатель — хвост кометы из последних точек курсора */}
          {activeTool === 'pointer' && pointerTrail.map((p, i) => (
            <Circle
              key={`own-${i}`} x={p.x} y={p.y}
              radius={2 + (5 * (i + 1)) / pointerTrail.length}
              opacity={(i + 1) / pointerTrail.length}
              fill="#7fd6ff"
            />
          ))}

          {/* указатели остальных участников комнаты */}
          {Object.entries(remotePointers).flatMap(([userId, pos]) => {
            const trail = remotePointerTrails.current[userId] || [{ x: pos.x, y: pos.y }];
            return trail.map((p, i) => (
              <Circle
                key={`${userId}-${i}`} x={p.x} y={p.y}
                radius={2 + (5 * (i + 1)) / trail.length}
                opacity={(i + 1) / trail.length}
                fill="#ff9f6c"
              />
            ));
          })}
        </Layer>

        {/* туман войны — самый верхний слой, перекрывает всё, включая
            токены. listening только пока активен инструмент тумана: в
            остальных режимах фигуры не должны перехватывать клики по
            токенам под собой. У игроков editable всегда false. */}
        <Layer listening={activeTool === 'fog'}>
          {Object.values(fogShapes).map((shape) => (
            <FogShapeNode
              key={shape.id}
              shape={shape}
              isGm={isGm}
              editable={isGm && activeTool === 'fog'}
              shapeRef={(node) => { if (node) fogShapeRefs.current[shape.id] = node; }}
              onSelect={() => setSelectedFogId(shape.id)}
              onDragMove={(id, x, y) => moveFogShapeLive(roomId, id, { pos_x: x, pos_y: y })}
              onDragEnd={(id, x, y) => commitFogShapeTransform(roomId, id, { pos_x: x, pos_y: y })}
              onTransformEnd={(id, node) => {
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                commitFogShapeTransform(roomId, id, {
                  pos_x: node.x(),
                  pos_y: node.y(),
                  rotation: node.rotation(),
                  width: Math.max(10, (shape.width || 10) * scaleX),
                  height: Math.max(10, (shape.height || 10) * scaleY),
                });
              }}
            />
          ))}

          {isGm && activeTool === 'fog' && fogDrawRect && (
            <Rect
              x={fogDrawRect.x} y={fogDrawRect.y} width={fogDrawRect.width} height={fogDrawRect.height}
              fill="rgba(20,20,25,0.5)" stroke="#f6f7f9" dash={[6, 4]}
            />
          )}

          {isGm && activeTool === 'fog' && (
            <Transformer
              ref={fogTransformerRef}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox)}
            />
          )}
        </Layer>
      </Stage>

      {showTokenPanel && (
        <TokenActionPanel
          x={stageTransform.x + selectedToken.pos_x * stageTransform.scale}
          y={stageTransform.y + (selectedToken.pos_y + (selectedToken.height || 50) / 2) * stageTransform.scale}
          locked={!!selectedToken.locked}
          layer={selectedToken.layer ?? 10}
          canDelete={canMoveToken(selectedToken)}
          conditions={selectedToken.conditions || []}
          onToggleLock={() => setTokenLocked(roomId, selectedToken.id, !selectedToken.locked)}
          onSetLayer={(layer) => setTokenLayer(roomId, selectedToken.id, layer)}
          onToggleCondition={(next) => setTokenConditions(roomId, selectedToken.id, next)}
          onDelete={() => {
            if (!window.confirm('Удалить токен с карты?')) return;
            removeToken(roomId, selectedToken.id);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
