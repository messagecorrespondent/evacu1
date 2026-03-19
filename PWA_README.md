# Evacu PWA — Setup Guide

## Mitä tarvitset
- Firebase-projekti (sama kuin PC-sovelluksessa)
- Jokin tapa hostata tiedostot (Firebase Hosting on helpoin)

---

## Vaihe 1: Lisää Firebase Web Config

Avaa `index.html` ja etsi kohta:

```javascript
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  ...
```

Korvaa nämä omilla arvoillasi:
- Firebase Console → Project Settings → General
- Scroll to "Your apps" → Web app (</> ikoni)
- Jos ei ole web app → "Add app" → Web
- Kopioi config-objekti

---

## Vaihe 2: Hostaa Firebase Hostingilla (helpoin)

```bash
# Asenna Firebase CLI
npm install -g firebase-tools

# Kirjaudu
firebase login

# Alusta projekti evacu_pwa-kansiossa
firebase init hosting

# Vastaa:
# - Use existing project: evacu-admin
# - Public directory: . (piste)
# - Single-page app: No
# - Overwrite index.html: No

# Deploy!
firebase deploy --only hosting
```

Saat URL:n muotoa: `https://evacu-admin.web.app`

---

## Vaihe 3: Avaa puhelimella

1. Avaa URL puhelimen selaimessa (Chrome Android / Safari iOS)
2. Sovellus pyytää notifikaatioluvan → hyväksy
3. Näet Device ID:n → anna adminille
4. Admin lisää laitteen Evacu Admin PC-sovelluksessa
5. Paina "Connect to System"
6. Lisää kotinäytölle: Chrome → ⋮ → "Add to Home Screen"

---

## Vaihtoehtoiset hosting-tavat

### Netlify (ilmainen, helppo)
1. Mene netlify.com
2. Vedä `evacu_pwa`-kansio sivulle
3. Saat URL:n heti

### GitHub Pages
1. Luo GitHub repo
2. Lisää tiedostot
3. Settings → Pages → Deploy from main

---

## PWA toimii kuin natiivi app
- Lisää kotinäytölle → näyttää normaalilta appilta
- Push-notifikaatiot
- Toimii offline (perustoiminnot)
- Hold-to-send napit
- Viestit ja vastaukset
- Täysruudun hälytysoverlay
