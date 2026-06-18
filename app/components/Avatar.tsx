import type { Member } from "@/lib/mock-data";

export function Avatar({
  member,
  size = 36,
}: {
  member: Member;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{
        background: member.color,
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
      title={member.name}
      aria-hidden
    >
      {member.short}
    </span>
  );
}
