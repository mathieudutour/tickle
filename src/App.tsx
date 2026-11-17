import { useContext, useEffect, useRef } from "react";
import { ReminderPane, ReminderSheet } from "./components/ReminderSheet";
import { DetailsPane } from "./lib/detailsPane";
import { JoinSheet } from "./components/Sharing";
import { useDeleteReminder } from "./components/useDeleteReminder";
import { useKeyboardShortcuts } from "./components/useKeyboardShortcuts";
import { useEditingId } from "./lib/inlineEdit";
import { useUi } from "./components/UiProvider";
import { useMe } from "./lib/me";
import { updatePushRegistration } from "./lib/push";
import { hrefOf, takeHashParam, useRoute } from "./lib/router";
import { useWide, WIDE } from "./lib/useWide";
import { useStore } from "./store/StoreProvider";
import { Home } from "./views/Home";
import { ListView } from "./views/ListView";
import { Settings } from "./views/Settings";
import { TagView } from "./views/TagView";
import { TodayView } from "./views/TodayView";

export function App() {
  const [route, navigate] = useRoute();
  const { sync, space } = useStore();
  const me = useMe(space);
  const { openSheet, toast } = useUi();
  const wide = useWide();
  useKeyboardShortcuts(route);

  // A new reminder (Return makes them) still without a title when editing in place ends goes away, as in Reminders:
  // silently when nothing was added to it, with « Annuler » otherwise. Erasing a title is handled by InlineEditor.
  const editingId = useEditingId();
  const lastEditing = useRef<string | null>(null);
  const deleteReminder = useDeleteReminder();
  useEffect(() => {
    const left = lastEditing.current;
    lastEditing.current = editingId;
    if (!left || left === editingId) return;
    // Read fresh: the editor saved its text as it closed, after this render.
    const reminder = sync.getState().reminders[left];
    if (!reminder || reminder.title.trim()) return;
    const blank = !reminder.notes && !reminder.due && !reminder.tags.length && !reminder.url;
    if (blank && !Object.values(sync.getState().reminders).some((r) => r.parentId === left))
      sync.dispatch({ type: "deleteReminder", id: left });
    else deleteReminder(left);
  }, [editingId, sync, deleteReminder]);
  // On a wide screen, the reminder shown in the right pane. Moving to another screen clears it, unless a reminder was
  // asked for on the way (a notification opens its list and selects it).
  const { selectedId: selected, show: setSelected } = useContext(DetailsPane);
  const selectAfterNavigation = useRef<string | null>(null);
  const routeKey = hrefOf(route);
  useEffect(() => {
    setSelected(selectAfterNavigation.current);
    selectAfterNavigation.current = null;
  }, [routeKey]);

  // Alerts for reminders assigned to someone else skip this device once it says who it is.
  useEffect(() => void updatePushRegistration(), [me?.id]);

  // What the agents do, and other news from the space, shows as a toast.
  useEffect(() => {
    sync.onNotice = toast;
    return () => void (sync.onNotice = undefined);
  }, [sync, toast]);

  // Invitation links (#rejoindre=…) and notifications (#rappel=…) open a sheet.
  useEffect(() => {
    const open = () => {
      const joinKey = takeHashParam("rejoindre");
      if (joinKey) {
        if (joinKey === sync.getStatus().key) toast("Tu partages déjà ces listes");
        else
          openSheet((close) => (
            <JoinSheet
              joinKey={joinKey}
              onDone={(joined) => {
                close();
                if (joined) toast("Bienvenue ! Les listes partagées arrivent…");
              }}
            />
          ));
      }
      const reminderId = takeHashParam("rappel");
      const reminder = reminderId ? sync.getState().reminders[reminderId] : undefined;
      if (reminder) {
        if (matchMedia(WIDE).matches) selectAfterNavigation.current = reminder.id;
        navigate({ name: "list", id: reminder.listId });
        if (!matchMedia(WIDE).matches)
          openSheet((close) => <ReminderSheet id={reminder.id} onClose={close} />);
      }
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, [sync, openSheet, toast, navigate]);

  const screen = (() => {
    switch (route.name) {
      case "list":
        return <ListView id={route.id} navigate={navigate} />;
      case "today":
        return <TodayView navigate={navigate} />;
      case "tag":
        return <TagView key={route.tag} tag={route.tag} navigate={navigate} />;
      case "settings":
        return <Settings navigate={navigate} />;
      default:
        // On a wide screen the lists are always in the sidebar: the middle shows today's reminders.
        return wide ? <TodayView navigate={navigate} /> : <Home navigate={navigate} />;
    }
  })();
  if (!wide) return screen;

  // Lists, the selected list, and the selected reminder's details, side by side as in Reminders on a Mac.
  const shown = selected && space.reminders[selected] ? selected : null;
  return (
    <div className="split">
      <nav className="pane sidebar" aria-label="Listes">
        <Home navigate={navigate} sidebar current={route} />
      </nav>
      <main className="pane middle">{screen}</main>
      <div className="pane inspector">
        {shown ? (
          <ReminderPane key={shown} id={shown} onClose={() => setSelected(null)} />
        ) : (
          <p className="empty-note">Choisis un rappel pour voir ses détails.</p>
        )}
      </div>
    </div>
  );
}
