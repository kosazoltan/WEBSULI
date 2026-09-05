/**
 * #172 — a MaterialImprover törlés-megerősítőjének szövege, státusz szerint.
 *
 * Miért külön modul: a régi generikus szöveg („Biztosan törlöd? Nem vonható
 * vissza.") azt a kérdést váltotta ki, hogy a TANANYAG is törlődik-e. A mért
 * valóság (routes.ts DELETE /improved-files/:id + storage.deleteImprovedHtmlFile):
 * a törlés kizárólag az improved_html_files sort érinti — a html_files
 * (tananyag) és a material_improvement_backups (backup) érintetlen.
 */

export function deleteImprovedConfirmMessage(status: string): string {
  if (status === "applied") {
    return [
      "Biztosan törlöd ezt a javítási másolatot?",
      "A tananyag a már alkalmazott, javított tartalommal marad élesben — azt a törlés nem érinti.",
      "Csak ez az előzmény-másolat és az „Újra alkalmaz” lehetőség vész el.",
      "A művelet nem vonható vissza.",
    ].join(" ");
  }
  return [
    "Biztosan törlöd? Ez csak ezt a javítási másolatot törli — az eredeti tananyagot NEM érinti,",
    "az változatlanul megmarad a fájlok között.",
    "A művelet nem vonható vissza.",
  ].join(" ");
}
