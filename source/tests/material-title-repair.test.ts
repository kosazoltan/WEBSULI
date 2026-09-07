import assert from 'node:assert/strict';
import test from 'node:test';
import {repairedMaterialTitle} from '../server/scripts/materialTitleRepair';
test('repair keeps custom grade and chapter distinctions',()=>{
 assert.equal(repairedMaterialTitle('Az ókori Hellász II - 8. osztály','<title>Az ókori Hellász - 8. osztály</title>'),'Az ókori Hellász II - 8. osztály');
 assert.equal(repairedMaterialTitle('There are – Angol 4. osztály','<title>There is / There are – Angol 3. osztály</title>'),'There are – Angol 4. osztály');
 assert.equal(repairedMaterialTitle('Matek – Összefoglaló','<title>Websuli lecke</title>'),'Matek – Összefoglaló');
});
test('repair restores accented heading text, removes filename slugs and trailing damage',()=>{
 assert.equal(repairedMaterialTitle('4. osztály - 25. Betegseg, gyogyulas - 4. osztaly tananyag','<title>25. Betegseg, gyogyulas</title><h1>🌸 25. Betegség, gyógyulás 🌸</h1>'),'4. osztály - 25. Betegség, gyógyulás - 4. osztály tananyag');
 assert.equal(repairedMaterialTitle('8. osztály - osszetett-szavak-tananyag-v7','<title>Összetett szavak – 8. osztály</title>'),'Összetett szavak – 8. osztály');
 assert.equal(repairedMaterialTitle('Hellász - 8. osztály< ',''),'Hellász - 8. osztály');
});
