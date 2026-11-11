# TERRA Costruzioni — site vitrine

Site one-page pour une entreprise de construction : en faisant défiler la page, une maison 3D se construit étape par étape (terrain → structure → finitions → intérieur → extérieurs → remise des clés), avec un HUD (jour de chantier, % d'avancement, étape, plan qui se dessine).

- `index.html` — structure et textes
- `style.css` — mise en page (responsive mobile)
- `main.js` — scroll, HUD, traduction EN/IT, formulaire
- `scene.js` — scène 3D procédurale (Three.js, aucune image à charger)

## Lancer en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Un serveur est nécessaire : les modules ES ne se chargent pas en `file://`.)

## À personnaliser

- Nom, adresse, téléphone, e-mail : `index.html` (section `#contact` et pied de page)
- Textes et traductions : dictionnaire `I18N` dans `main.js`
- Formulaire : brancher un service (Formspree, Netlify Forms, API…) dans le gestionnaire `submit` en bas de `main.js`
- Couleurs / polices : variables CSS en haut de `style.css`

Déployable tel quel sur GitHub Pages, Netlify ou Vercel (site statique).
