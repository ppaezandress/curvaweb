import type { Client, Project, Task, Member } from "@/lib/mock-data";

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export type MeetingSuggestion = {
  taskId?: string;
  projectId?: string;
  clientId?: string;
  label: string; // texto a mostrar ("Eleva · Reclutamiento")
  attendeeMemberIds: string[]; // miembros del equipo que estuvieron
};

// Sugiere a qué proyecto/cliente/tarea corresponde una junta, por su título.
// Convención de clave opcional: "[ELEVA]" o "Eleva - ..." → matchea ese cliente/proyecto.
export function suggestForMeeting(
  title: string,
  attendeeEmails: string[],
  data: { clients: Client[]; projects: Project[]; tasks: Task[]; members: Member[] },
): MeetingSuggestion {
  const t = norm(title);
  const attendeeMemberIds = data.members
    .filter((m) => m.email && attendeeEmails.includes(m.email.toLowerCase()))
    .map((m) => m.id);

  // 1) ¿menciona una tarea por nombre? (señal fuerte)
  const task = data.tasks.find((x) => x.name.length > 6 && t.includes(norm(x.name).slice(0, 24)));
  if (task) {
    const proj = data.projects.find((p) => p.id === task.projectId);
    const cli = data.clients.find((c) => c.id === (task.clientId || proj?.clientId));
    return { taskId: task.id, projectId: proj?.id, clientId: cli?.id, label: labelOf(cli, proj), attendeeMemberIds };
  }

  // 2) ¿menciona un proyecto?
  const proj = data.projects.find((p) => {
    const n = norm(p.name);
    return n.length > 4 && (t.includes(n.slice(0, 20)) || n.includes(t.slice(0, 20)));
  });
  if (proj) {
    const cli = data.clients.find((c) => c.id === proj.clientId);
    return { projectId: proj.id, clientId: cli?.id, label: labelOf(cli, proj), attendeeMemberIds };
  }

  // 3) ¿menciona un cliente? (por nombre o clave [XXX])
  const cli = data.clients.find((c) => {
    const n = norm(c.name).split(/\s|\(/)[0]; // primera palabra ("grupo eleva" → "grupo"? usa nombre completo también)
    return t.includes(norm(c.name).slice(0, 16)) || (n.length > 3 && t.includes(n));
  });
  if (cli) return { clientId: cli.id, label: cli.name, attendeeMemberIds };

  return { label: "", attendeeMemberIds };
}

function labelOf(cli?: Client, proj?: Project): string {
  if (cli && proj) return `${cli.name} · ${proj.name}`;
  if (proj) return proj.name;
  if (cli) return cli.name;
  return "";
}
