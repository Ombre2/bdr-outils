// Classe commune des champs <select> natifs : plus rapides au clavier qu'un composant riche.
// Fond et texte explicites (y compris pour la liste déroulante et ses options) :
// les tokens suivent le thème clair/sombre, donc la liste reste lisible dans les deux.
export const nativeSelectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring [&>option]:bg-background [&>option]:text-foreground'
