# Pronokikz — application mobile

Application React Native / Expo connectée à l'API Pronokikz.

## Démarrage

```powershell
npm install
npx expo start
```

## Adresse de l'API

Créer `.env` à partir de `.env.example` dans ce dossier et renseigner `EXPO_PUBLIC_API_URL`.

- Téléphone sur le même Wi-Fi que le PC : `http://ADRESSE_IP_DU_PC:3001`
- API hébergée : renseigner son URL HTTPS publique.

Ne jamais placer de clé Football-Data ou Odds API dans l'application mobile. Les clés restent côté serveur.
