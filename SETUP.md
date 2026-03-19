# Evacu PWA - Setup

## 1. Lisää Firebase-asetukset app.js tiedostoon

Avaa app.js ja korvaa FIREBASE_CONFIG arvot omillasi.
Löydät ne Firebase Consolesta: Project Settings -> General -> Your apps -> Config

## 2. Hostaa tiedostot

Helpoin tapa: Firebase Hosting (ilmainen)

  npm install -g firebase-tools
  firebase login
  firebase init hosting   (valitse evacu-admin projekti)
  firebase deploy

Tai: Laita tiedostot mille tahansa web-palvelimelle.

## 3. Avaa puhelimella

Mene selaimella osoitteeseen jossa tiedostot ovat.
Lisää kotinäytölle: Share -> Add to Home Screen

## 4. Yhdistä

Sovellus näyttää Device ID:n.
Lisää se Evacu Admin PC-sovelluksessa Devices-osiossa.
Klikkaa "Connect" -> valmis!
