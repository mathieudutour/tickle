import { useEffect } from "react";
import { ReminderSheet } from "./components/ReminderSheet";
import { JoinSheet } from "./components/Sharing";
import { useUi } from "./components/UiProvider";
import { takeHashParam, useRoute } from "./lib/router";
import { useStore } from "./store/StoreProvider";
import { Home } from "./views/Home";
import { ListView } from "./views/ListView";
import { Settings } from "./views/Settings";
import { TagView } from "./views/TagView";
import { TodayView } from "./views/TodayView";

export function App() {
  const [route, navigate] = useRoute();
  const { sync } = useStore();
  const { openSheet, toast } = useUi();

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
        navigate({ name: "list", id: reminder.listId });
        openSheet((close) => <ReminderSheet id={reminder.id} onClose={close} />);
      }
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, [sync, openSheet, toast, navigate]);

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
      return <Home navigate={navigate} />;
  }
}
