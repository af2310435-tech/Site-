# Visuels photoréalistes : comment les produire

Le site affiche automatiquement, par ordre de priorité :

1. **`assets/build.mp4`** : une vidéo de toute la construction. Le scroll avance et recule dans la vidéo (c'est la technique du site de la vidéo d'exemple).
2. **`assets/stages/1-ground.jpg` … `6-home.jpg`** : une photo par étape, en fondu avec un léger zoom.
3. Sinon, la scène 3D (`scene.js`).

Il suffit de déposer les fichiers dans ces dossiers : aucun code à toucher.

## Méthode (pour que ce soit toujours la même maison)

La cohérence entre les étapes est le point clé. Ne génère pas 6 images séparément.

1. **Génère d'abord l'image finale** (prompt 6) avec Midjourney, ChatGPT (images), Gemini (Nano Banana), Flux… Garde celle qui te plaît.
2. **Dérive les étapes précédentes à partir de cette image** avec un outil d'édition d'image (ChatGPT, Gemini, Flux Kontext, Midjourney *Editor*) : tu lui donnes l'image finale + le prompt de l'étape. Le cadrage, le terrain et les arbres restent identiques ; seule la maison change.
3. Pour les vues intérieures (4 et 5), même principe : génère la vue, puis garde-la comme référence.
4. **Vidéo (option la plus spectaculaire)** : dans Kling, Veo, Runway ou Luma, utilise le mode *première image / dernière image* entre deux étapes consécutives (1→2, 2→3, …), avec un prompt du type
   `slow cinematic drone push-in, the house is being built, construction time-lapse, static lighting changes`.
   Mets les 5 clips bout à bout, puis encode pour un scroll fluide :

   ```bash
   ffmpeg -i montage.mp4 -an -c:v libx264 -preset slow -crf 20 -g 1 -pix_fmt yuv420p \
          -vf "scale=1920:-2" -movflags +faststart assets/build.mp4
   ```
   (`-g 1` = une image clé par image : indispensable pour que la vidéo suive le scroll sans à-coups. Vise 8 à 15 s, 25 i/s.)

Format conseillé : 16:9, au moins 1920×1080, JPG qualité ~82 (300–500 Ko par image).

## Prompts (en anglais, ça marche mieux)

Style commun à ajouter à la fin de chaque prompt :

> `photorealistic architectural photography, Tuscany, rolling hills with cypress trees and olive groves, shot on Sony A7R IV, 24mm, aerial drone view, ultra detailed, natural light, 16:9`

**6 — Home (à faire en premier)**
> Modern two-storey villa in the Tuscan countryside at sunset: white rendered ground floor with floor-to-ceiling glass, upper floor clad in vertical larch wood, dark blue standing-seam metal gable roof with a small chimney, warm interior lights on, large rectangular infinity pool lit in turquoise in front, travertine terrace with outdoor furniture and parasol, lavender and olive trees, stone retaining wall, golden sun low on the horizon behind the hills

**1 — Ground** (édition de l'image 6)
> Same place, same camera angle. The villa does not exist yet: only a freshly poured concrete foundation slab with steel rebar sticking out, construction site with brown soil, pallets of red bricks, timber stacks, a yellow tower crane, soft morning light

**2 — Structure** (édition de l'image 1 ou 6)
> Same place, same camera angle. The villa is under construction: red brick and reinforced concrete structure of two floors, openings for the windows, the roof frame being installed, scaffolding, yellow tower crane, construction site, midday light

**3 — Finish** (édition de l'image 6)
> Same place, same camera angle. The villa exterior is almost finished: white render on the ground floor, larch wood cladding upstairs, dark metal roof, windows installed but no garden yet, bare soil around, no pool yet, golden hour light

**4 — Inside**
> Interior of the same villa: open-plan living room with linen sofa, fireplace, oak floor, kitchen island in white marble with pendant lights, floor-to-ceiling windows looking onto the Tuscan hills at dusk, warm lighting, architectural interior photography, 24mm, eye level

**5 — Living**
> Same villa, eye-level view from the terrace at blue hour: turquoise lit swimming pool in the foreground, travertine deck, sun loungers, the glass living room glowing warm inside, wood-clad upper floor, cypress trees and hills in the background

## Après génération

Renomme les fichiers exactement ainsi, puis pousse-les :

```
assets/stages/1-ground.jpg
assets/stages/2-structure.jpg
assets/stages/3-finish.jpg
assets/stages/4-inside.jpg
assets/stages/5-living.jpg
assets/stages/6-home.jpg
assets/build.mp4          (facultatif, prioritaire sur les images)
```

Tu peux aussi m'envoyer les images ici : je les intègre, je règle les fondus et je vérifie le rendu.
