/*
 * Noctis — habillage de l'installeur NSIS.
 *
 * Ce fichier est inclus par electron-builder au tout début du script : les
 * !define ci-dessous sont donc lus par Modern UI 2 avant ses propres
 * valeurs par défaut. Les images sont dans build\branding (générées par
 * installer\make-branding.ps1).
 */

!define NOCTIS_BRAND "${__FILEDIR__}\branding"

; --- Palette -----------------------------------------------------------
!define MUI_BGCOLOR "0B0C10"
!define MUI_TEXTCOLOR "F4F2EC"

; --- Images ------------------------------------------------------------
; electron-builder fournit ses propres images par défaut : on les remplace.
!undef MUI_WELCOMEFINISHPAGE_BITMAP
!undef MUI_UNWELCOMEFINISHPAGE_BITMAP
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NOCTIS_BRAND}\sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${NOCTIS_BRAND}\sidebar-uninstall.bmp"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${NOCTIS_BRAND}\header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "${NOCTIS_BRAND}\header-uninstall.bmp"

; Page de progression : liste sombre, barre ambre.
!define MUI_INSTFILESPAGE_COLORS "F59E0B 0B0C10"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth colored"

; --- Textes ------------------------------------------------------------
!define MUI_WELCOMEPAGE_TITLE "Bienvenue dans Noctis"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "Films, séries, animés et TV en direct, réunis dans une seule application.$\r$\n$\r$\nL'installation se fait pour votre compte Windows, sans droits administrateur. Vos listes et préférences restent dans votre profil.$\r$\n$\r$\nCliquez sur Suivant pour continuer."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Choisissez où installer Noctis. Le sous-dossier « Noctis » est ajouté automatiquement."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Dossier d'installation"

!define MUI_FINISHPAGE_TITLE "Noctis est installé"
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TEXT "Tout est prêt.$\r$\n$\r$\nRetrouvez Noctis dans le menu Démarrer et sur le Bureau. Le statut Discord « Regarde Noctis » s'active au lancement.$\r$\n$\r$\nnoctis.ct.ws"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer Noctis"

; La page d'accueil n'apparaît pas lors d'une mise à jour.
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

; --- Page d'installation ------------------------------------------------
; NSIS laisse cette page sur fond clair : on la repeint comme les autres.
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW noctisInstFilesShow
!macroend

; --- Page de fin --------------------------------------------------------
; electron-builder définit lui-même StartApp et la case « Lancer » ; on les
; reprend pour pouvoir repeindre la case (voir noctisFinishShow).
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW noctisFinishShow
  !insertmacro MUI_PAGE_FINISH
!macroend

; --- Désinstalleur -----------------------------------------------------
; Modern UI 2 n'a pas de MUI_UNWELCOMEPAGE_* : les pages de désinstallation
; relisent les textes d'installation. On les remplace juste avant de les
; insérer, c'est-à-dire ici.
!macro customUnWelcomePage
  !undef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Désinstaller Noctis"
  !undef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "Noctis va être retiré de cet ordinateur.$\r$\n$\r$\nL'application, ses raccourcis et ses fichiers seront supprimés. Vos listes et préférences enregistrées dans votre profil Windows sont conservées.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Insérée juste avant la page de fin de désinstallation (voir
; assistedInstaller.nsh) : on y remplace le texte « installation ».
!macro customUninstallPage
  !undef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "Noctis a été désinstallé"
  !undef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "L'application et ses raccourcis ont été retirés de cet ordinateur.$\r$\n$\r$\nVos préférences sont conservées dans votre profil Windows.$\r$\n$\r$\nMerci d'avoir utilisé Noctis.$\r$\n$\r$\nnoctis.ct.ws"
!macroend

; La page « désinstallation en cours » est dessinée par le noyau NSIS et ne
; réagit pas aux couleurs MUI. Seules ses pages d'accueil et de fin sont
; habillées (voir customUnWelcomePage / customUninstallPage).

; Les pages sont déjà insérées quand ces macros sont lues : les variables
; $mui.* existent donc ici (et pas plus haut dans ce fichier).
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Function noctisFinishShow
      ; MUI2 ne retire le thème Windows de cette case qu'en contraste élevé.
      ; Sur un fond sombre, son libellé resterait noir (donc invisible) :
      ; on force le rendu classique pour que SetCtlColors s'applique.
      System::Call 'UXTHEME::SetWindowTheme(p$mui.FinishPage.Run, w" ", w" ")'
      SetCtlColors $mui.FinishPage.Run "F4F2EC" "0B0C10"
      System::Call 'USER32::InvalidateRect(p$mui.FinishPage.Run, p0, i1)'
    FunctionEnd

    Function noctisInstFilesShow
      SetCtlColors $mui.InstFilesPage "" "0B0C10"
      SetCtlColors $mui.InstFilesPage.Text "F4F2EC" "0B0C10"
      SetCtlColors $mui.InstFilesPage.Log "F4F2EC" "0B0C10"

      ; Le thème Windows impose sa barre verte : on reprend la main.
      System::Call 'UXTHEME::SetWindowTheme(p$mui.InstFilesPage.ProgressBar, w" ", w" ")'
      SendMessage $mui.InstFilesPage.ProgressBar 0x0409 0 0x000B9EF5 ; PBM_SETBARCOLOR (ambre)
      SendMessage $mui.InstFilesPage.ProgressBar 0x2001 0 0x00100C0B ; PBM_SETBKCOLOR (fond)
    FunctionEnd
  !endif
!macroend
