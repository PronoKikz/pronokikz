# Moteur prédictif Pronokikz v2

Cette branche introduit un moteur statistique isolé dans `predictor.js`.

## Méthode

- Mélange des moyennes de buts à domicile / extérieur et des moyennes générales.
- Lissage des petits échantillons vers une moyenne de ligue.
- Pondération des cinq derniers matchs, avec un poids croissant pour les plus récents.
- Ajustement Elo modéré, calculé chronologiquement sur les matchs terminés.
- Distribution de Poisson avec correction Dixon–Coles sur les petits scores.
- Calcul des probabilités 1/N/2, BTTS, plus de 2,5 buts, buts attendus et score modal.

## Tests

Exécuter avec Node.js 20 ou supérieur :

```bash
node tests/predictor.test.js
```

## Limites connues

- L'Elo est initialisé à 1500 au début de l'historique de compétition disponible ; il ne s'agit pas encore d'un Elo pluriannuel.
- Les moyennes de ligue sont des valeurs de départ globales, à remplacer par des moyennes calculées par compétition.
- Les blessures, compositions, suspensions, météo et calendrier ne sont pas encore intégrés.
- Le score modal n'est pas une prédiction certaine ; il s'agit du score individuel ayant la probabilité calculée la plus élevée.
- Aucun niveau de performance n'est revendiqué avant un backtest chronologique sur un historique suffisamment long.

Les estimations doivent être évaluées avec le score de Brier, le log loss et des courbes de calibration, puis comparées à des références simples (fréquences historiques et cotes de marché si disponibles).
