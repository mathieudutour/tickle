import type { Member, Space } from "../shared/space";

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The member a typed name (« @lea », or « Léa » from an agent) refers to: an exact name first, then a prefix. */
export function findMember(space: Space, name: string): Member | undefined {
  const wanted = fold(name.trim().replace(/^@/, ""));
  if (!wanted) return undefined;
  return (
    space.members.find((m) => m.id === name || fold(m.name) === wanted) ??
    space.members.find((m) => fold(m.name).startsWith(wanted))
  );
}
