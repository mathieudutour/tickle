# Tickle

Rappels et listes partagés, comme l’app Rappels d’iOS, dans une web app installable : listes avec sections, dates, heures, répétitions, alertes, priorités, tags et sous-tâches. Tout se synchronise en direct entre les appareils de l’espace, et un agent IA peut s’en servir par MCP.

## Ce que fait l’app

- **Aujourd’hui** : les rappels du jour de toutes les listes, en retard d’abord, puis toute la journée, matin, après-midi et soir. Ceux assignés à quelqu’un d’autre n’y sont pas.
- **Personnes** : on assigne un rappel à quelqu’un de l’espace (dans le rappel, ou « @Léa » en saisie rapide). Il n’y a pas de compte : chaque appareil dit qui il est (Réglages › Personnes), et seuls les appareils de la personne assignée reçoivent l’alerte.
- **Listes** : nom, couleur, icône, sections, réordonnées depuis l’accueil, et une vue par tag. Dans une liste, on glisse un rappel par sa poignée pour le déplacer, y compris d’une section à l’autre.
- **Saisie rapide en français** : « Sortir les poubelles tous les mardis 20h #maison !! @Léa » donne la date, la répétition, le tag, la priorité et la personne (`src/lib/parse.ts`). Un aperçu montre ce qui a été compris.
- **Rappels** : notes, lien, date avec ou sans heure, alerte anticipée, répétition (tous les jours, en semaine, le week-end, toutes les N semaines, mois ou années, avec une fin), priorité, tags, liste et section, sous-tâches. Cocher un rappel répétitif garde une copie terminée et passe à la date suivante.
- **Recherche** dans les titres, notes, liens et tags. Les rappels terminés s’affichent liste par liste.
- **Alertes** : des notifications push à l’heure de chaque rappel, même app fermée. Sur iPhone, il faut d’abord ajouter Tickle à l’écran d’accueil.
- **Partage** : un lien ou un QR code (`/#rejoindre=…`) fait rejoindre tout l’espace. Il n’y a pas de compte.
- **Agents IA** : les mêmes outils sont servis par WebMCP dans le navigateur et par un serveur MCP distant.

## Architecture

- `src/shared/space.ts` : le modèle et le reducer, déterministe, qui tourne sur l’appareil et sur le serveur.
- `src/shared/sync.ts` : le protocole de synchronisation. Chaque action a un identifiant ; le serveur la versionne et la diffuse. L’appareil affiche ses actions en attente par-dessus le dernier état confirmé.
- `worker/space.ts` : un Durable Object `Space` par espace. Il gère :
  - l’état et les WebSockets (API d’hibernation) ;
  - les accès des agents et le MCP ;
  - les abonnements push et l’alarme qui envoie les alertes dues.

  Un espace que personne n’ouvre pendant 400 jours est supprimé.
- `worker/space.ts` (`Keys`) : la paire de clés VAPID, créée au premier usage, sans configuration.
- `src/agents/tools.ts` : les outils pour agents, partagés par WebMCP (`src/webmcp/register.ts`) et le MCP distant (`src/shared/mcp.ts`).
- `public/push-sw.js` : affiche les alertes et ouvre le rappel touché. Il est chargé dans le service worker généré par `vite-plugin-pwa`.

Tous les espaces existent sur le serveur dès le premier lancement en ligne : c’est ce qui permet les alertes, le partage et les agents. Hors ligne, les changements attendent et partent à la reconnexion.

## Connecter un agent (Hermes, etc.)

Dans **Réglages › Agents IA**, choisis **Connecter un agent**. Tickle affiche une seule fois un jeton et la configuration à copier. Pour Hermes, elle va dans `~/.hermes/config.yaml` :

```yaml
mcp_servers:
  tickle:
    url: "https://<ton-domaine>/api/mcp"
    headers:
      Authorization: "Bearer <jeton>"
```

Le serveur MCP est en Streamable HTTP sans état (`POST /api/mcp`). Il expose les outils suivants :

- `get_overview`, `list_reminders`, `get_reminder` ;
- `add_reminder`, `update_reminder`, `complete_reminder`, `delete_reminder`, `reorder_reminders`, `clear_completed` ;
- `add_list`, `update_list`, `delete_list`.

Ce que fait l’agent apparaît en direct sur les appareils, avec une notification « 🤖 Hermes · … ».

## Développement

```sh
npm install
npm run dev        # Vite, avec le Worker et les Durable Objects (http://localhost:5173)
npm test           # vitest
npm run typecheck
npm run build
```

Les notifications push ne marchent qu’avec le service worker de production : `npm run build && npx wrangler dev`, ou une fois déployé.

## Illustrations et icônes

Les originaux (environ 1 Mo chacun) vont dans `art-sources/`, qui n’est pas versionné :

- les illustrations (`all-done`, `empty-list`, `no-results`, `sharing`, `alerts`, `agents`) ;
- `icon.png`, l’icône de l’app, carrée et sans transparence ;
- `og.png`, l’aperçu des liens.

`sh scripts/art.sh` (ImageMagick 7) les compresse dans `src/assets/art/` et refait les icônes de `public/` et `public/og.jpg`. Le script efface au passage le halo pâle que les générateurs ajoutent autour des formes, qui ferait un voile gris en thème sombre.

Après un changement d’icône ou de couleurs de fond, `sh scripts/splash.sh` redessine les écrans de lancement iPhone et iPad (`public/splash/`) et leurs balises dans `index.html`. Sans eux, iOS affiche un écran vide au lancement ; Android fabrique le sien à partir du manifeste.

## Déploiement

Cloudflare Workers, avec les Durable Objects SQLite (`wrangler.jsonc`). `npm run deploy`, ou Workers Builds connecté au dépôt :

- commande de build : `npm test && npm run build` ;
- commande de déploiement : `npx wrangler deploy`.
