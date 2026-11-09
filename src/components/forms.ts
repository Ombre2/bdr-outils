// Classe commune des champs <select> natifs : plus rapides au clavier qu'un composant riche.
// Fond et texte explicites (y compris pour la liste déroulante et ses options) :
// sans cela, un thème système sombre rend la liste blanche avec un texte illisible.
export const nativeSelectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none [color-scheme:light] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring [&>option]:bg-background [&>option]:text-foreground'
