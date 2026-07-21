import MemberCard from './MemberCard';

export default function PartyRoster({ room, myUserId, isGm }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {room.members.map((m) => (
        <MemberCard key={m.user_id} member={m} isMe={m.user_id === myUserId} isGm={isGm} roomId={room.id} />
      ))}
    </div>
  );
}
