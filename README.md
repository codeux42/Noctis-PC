# Noctis — application PC 1.3.0

Version bureau du site https://noctis.ct.ws : le site s'ouvre dans sa propre
fenêtre, sans navigateur autour (pas de barre d'adresse, pas d'onglets).

## Télécharger

- **Installeur :** https://github.com/codeux42/Noctis-PC/releases/download/v1.3.0/Noctis-Setup-1.3.0.exe
- **Version portable :** https://github.com/codeux42/Noctis-PC/releases/download/v1.3.0/Noctis-Portable-1.3.0.zip

Ces liens sont sur GitHub et ne dépendent pas de `noctis.ct.ws`.

## Installer (recommandé)

1. Double-clique sur **`installer\Noctis-Setup-1.3.0.exe`**.
2. L'installation est habillée aux couleurs Noctis (fond sombre, accents ambre,
   logo) : accueil, mode, dossier, progression et fin.
3. Choisis le dossier d'installation (ou garde celui proposé), puis **Installer**.
4. Coche **Lancer Noctis** si tu veux ouvrir l'application tout de suite.
5. Noctis apparaît dans le menu Démarrer et sur le Bureau.

L'installation se fait pour ton compte utilisateur : pas besoin d'administrateur.

L'installateur n'étant pas signé, Windows peut afficher un avertissement
SmartScreen : clique sur **Informations complémentaires → Exécuter quand même**.

## Désinstaller

**Paramètres → Applications → Noctis 1.3.0 → Désinstaller**, ou
« Uninstall Noctis » dans le menu Démarrer. L'assistant reste dans le style Noctis
et confirme la suppression avec « Noctis a été désinstallé ».

L'application, ses raccourcis et son entrée dans les paramètres Windows sont
retirés. Tes listes et préférences restent dans `%APPDATA%\Noctis` : supprime ce
dossier à la main si tu veux vraiment tout effacer.

## Lancer sans installer (portable)

- Double-clique sur **`Noctis.lnk`**.
- Ou directement : `release\Noctis-win32-x64\Noctis.exe`.

Pour un raccourci sur le Bureau : clic droit sur `Noctis.exe` →
**Envoyer vers → Bureau (créer un raccourci)**.

## Ce que fait l'application

- Charge le site en direct : les mises à jour du site arrivent seules, rien à
  réinstaller.
- Garde la session (connexion, Ma liste, réglages) entre deux lancements.
- Les liens internes restent dans l'application ; les liens externes (Discord…)
  s'ouvrent dans le navigateur par défaut.
- Écran d'accueil pendant le chargement et page « Connexion impossible » avec
  bouton Réessayer si le réseau est coupé.

## Bandeau de fenêtre

Les boutons **réduire / agrandir / fermer** sont intégrés en haut de l'application,
sur un bandeau transparent : ils restent discrets mais toujours visibles, y compris
sur fond sombre. Un double-clic sur le bandeau agrandit ou restaure la fenêtre.
`F11` masque complètement le bandeau pour le plein écran.

## Publicités et lecture

- Le bouton **« Regarder la publicité »** ouvre la page publicitaire dans une
  petite fenêtre Noctis, pas dans le navigateur. Ferme-la : le compteur passe à
  la publicité suivante. Après la dernière, la vidéo démarre toute seule.
- Le lecteur **Fluxora** reste dans la page. Si son bouton **« Lire
  maintenant »** ouvre lui aussi une publicité, elle s'affiche dans une fenêtre
  Noctis ; ferme-la et la lecture continue.
- Une fenêtre publicitaire ne peut pas ouvrir d'autres fenêtres en cascade.
- Si le site change de domaine publicitaire ou de lecteur, crée
  `%APPDATA%\Noctis\popups.json` avec ce contenu (sinon la liste livrée dans
  l'application est utilisée) :

```json
{
  "ads": ["celyntor.xyz"],
  "players": ["fluxora.sbs", "anicloud.top", "drive.google.com", "docs.google.com"]
}
```

Les sous-domaines (`www.…`) sont acceptés automatiquement.

## Statut Discord

L'application affiche automatiquement **« Regarde Noctis · … »** sur ton profil
Discord (la page en cours : Accueil, Films, Netflix…). Ça fonctionne parce que
c'est un vrai programme sur le PC, pas un site web.

- Discord de bureau doit être lancé ; l'application se reconnecte toute seule
  s'il démarre après elle.
- Pour couper : `Alt` → menu **Noctis** → décocher **Statut Discord**.
- Le statut disparaît quand la fenêtre est réduite ou fermée.
- Journal en cas de souci : `%APPDATA%\Noctis\presence.log`.

`presence.json` contient uniquement l'identifiant **public** de l'application
Discord utilisée (aucun jeton, aucun secret). On peut le remplacer par
l'identifiant d'une autre application Discord si besoin.

## Raccourcis

| Touche | Action |
|---|---|
| `F5` / `Ctrl+R` | Recharger (`Ctrl+Shift+R` : sans cache) |
| `F11` | Plein écran |
| `Alt` + `←` / `→` | Page précédente / suivante (aussi les boutons latéraux de la souris) |
| `Ctrl` + `+` / `-` / `0` | Zoom |
| `F12` | Outils de développement |
| `Ctrl+Q` | Quitter |

## Données

La session et la taille de la fenêtre sont stockées dans
`%APPDATA%\Noctis`. Supprimer ce dossier remet l'application à zéro.

## Développement

```powershell
npm install
npm start          # lance l'application
npm run package    # reconstruit release\Noctis-win32-x64 (portable)
npm run dist       # reconstruit installer\Noctis-Setup-<version>.exe
```

L'habillage de l'installateur se trouve dans `build\installer.nsh` ; les images
sont générées par `installer\make-branding.ps1` dans `build\branding`. La version
doit être la même dans `package.json`, `package-lock.json` et le script
`package`.

L'application est portable : le dossier `release\Noctis-win32-x64` peut être
déplacé tel quel. Windows peut afficher un avertissement car l'exécutable
n'est pas signé.
