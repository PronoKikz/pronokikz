# Pronokikz

Pronokikz regroupe le moteur de pronostics, le site web et l'application mobile.

## Organisation du dépôt

- `index.html`, `manifest.json`, `sw.js` : application web actuelle.
- `predictor.js`, `expert.js`, `update.js` : moteur de pronostics et mise à jour des données.
- `data.js`, `data.json` : données utilisées par l'application.
- `tests/` : tests automatisés du moteur.

## Architecture cible

Les prochaines étapes consistent à intégrer les sources locales de l'application Expo et du serveur API dans ce même dépôt :

```text
pronokikz/
├── mobile/       # Application Expo / React Native
├── server/       # API Node.js / Express
├── tests/        # Tests du moteur et de l'API
├── .github/      # Workflows GitHub Actions
└── (application web et moteur existants à la racine)
```

Les dossiers `mobile/` et `server/` seront ajoutés avec leurs vrais fichiers sources après vérification des versions locales, afin de ne pas écraser du code existant.

## Sécurité

- Ne jamais versionner `.env` ou une clé API.
- Copier les variables nécessaires dans un fichier `.env` local.
- Utiliser les secrets GitHub Actions pour les automatisations.
- Ne jamais versionner `node_modules/`.

## Développement

Chaque application pourra conserver son propre `package.json` et ses dépendances :
- `mobile/package.json`
- `server/package.json`
