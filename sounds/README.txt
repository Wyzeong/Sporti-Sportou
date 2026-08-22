Dépose ici ton fichier audio de fin de séance, avec exactement ce nom :

  victory.mp3   -> fanfare jouée à la fin d'une séance réussie

Format recommandé : .mp3 (le plus fiable sur iOS Safari).
Si tu veux un autre nom ou format (.wav, .m4a...), modifie la ligne
"new Audio('sounds/victory.mp3')" dans app.js (section SON), et le chemin
correspondant dans la liste APP_SHELL de sw.js pour qu'il reste disponible
hors ligne.

Le bip de décompte et le son de reprise pendant le repos restent générés
par le code (aucun fichier requis pour ceux-là).

Ce fichier README.txt n'est pas utilisé par l'appli, tu peux le supprimer
une fois ton son en place.
