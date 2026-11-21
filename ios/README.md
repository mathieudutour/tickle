# Tickle pour iOS

L’app native, en SwiftUI. Elle partage les espaces de l’app web : on peut avoir l’une sur son iPhone et l’autre sur le téléphone de quelqu’un d’autre, les listes restent les mêmes, en direct.

## Comment c’est fait

- **Une seule logique.** L’app exécute dans JavaScriptCore le code TypeScript de l’app web et du serveur : le reducer (`src/shared/space.ts`), l’algorithme de synchronisation (`src/shared/sync.ts`), la saisie rapide en français et les libellés de dates. Le point d’entrée est `src/native/core.ts`, compilé dans `Tickle/Resources/core.js` par `npm run build:native`. Le fichier compilé est versionné ; la CI vérifie qu’il correspond au code source.
- **Synchronisation.** `Tickle/Core/Store.swift` ouvre le même WebSocket que l’app web, envoie ce que le code partagé lui dit d’envoyer et enregistre l’état après chaque changement. Hors ligne, les changements attendent et partent à la reconnexion.
- **En arrière-plan.** Quand l’app n’est pas ouverte :
  - le serveur réveille l’iPhone par une notification silencieuse après chaque changement fait ailleurs (au plus une toutes les 30 secondes) ;
  - iOS relance aussi l’app de temps en temps pour se synchroniser (`BGAppRefreshTask`) ;
  - les changements en attente partent quand l’app passe en arrière-plan.
- **Alertes.** Le serveur envoie les rappels dus et le résumé du matin par APNs, comme il le fait par Web Push pour l’app web (`worker/apns.ts`). Une alerte de rappel propose « Fait ».
- **Liens d’invitation.** `public/.well-known/apple-app-site-association` les fait ouvrir dans l’app quand elle est installée.

## Développement

```sh
npm run build:native     # après un changement dans le code partagé
cd ios && xcodegen       # brew install xcodegen ; le .xcodeproj n’est pas versionné
open Tickle.xcodeproj
```

Dans le simulateur, deux arguments de lancement aident :

- `-TickleServer http://localhost:5173` utilise le serveur de `npm run dev` au lieu de celui de production ;
- `-TickleOpen list:ID`, `today`, `tag:NOM`, `settings` ou `reminder:ID` ouvre directement un écran (en Debug).

Tests : `xcodebuild test -project Tickle.xcodeproj -scheme Tickle -destination 'platform=iOS Simulator,name=iPhone 17'`. Le test de synchronisation (deux téléphones sur le vrai code du serveur) tourne quand un serveur de dev est lancé : `npm run dev -- --port 5299` à la racine, puis `TEST_RUNNER_TICKLE_TEST_SERVER=http://localhost:5299 xcodebuild test …`.

## Mise en place (une fois)

1. **Clé APNs**, pour les alertes et la synchronisation en arrière-plan. Sur developer.apple.com, dans Certificates, Identifiers & Profiles › Keys :
   - crée une clé avec « Apple Push Notifications service » ;
   - télécharge le fichier `.p8` et note son Key ID ;
   - puis, à la racine du dépôt :
     ```sh
     npx wrangler secret put APNS_KEY < AuthKey_XXXXXXXXXX.p8
     npx wrangler secret put APNS_KEY_ID
     ```
   L’équipe et l’identifiant de l’app sont déjà dans `wrangler.jsonc`. Sans la clé, l’app se synchronise quand elle est ouverte, mais ne reçoit ni alertes ni réveils.
2. **App Store Connect** : crée l’app (identifiant `com.mathieudutour.tickle`, équipe 8SEPFSC7S3). Le nom doit être libre sur l’App Store. Xcode enregistre l’identifiant et ses capacités (push, domaines associés) au premier build signé.
3. **TestFlight** : ajoute les testeurs dans App Store Connect › TestFlight.

## Publier sur TestFlight

```sh
ios/scripts/release.sh
```

Le script compile, archive et envoie une nouvelle version à App Store Connect, avec un numéro de build tiré de l’heure. Il utilise le compte Apple connecté à Xcode, ou une clé d’API App Store Connect si `ASC_KEY_PATH`, `ASC_KEY_ID` et `ASC_ISSUER_ID` sont définis.
