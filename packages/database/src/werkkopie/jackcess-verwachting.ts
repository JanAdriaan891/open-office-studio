/** Testgegevens: Verwachte SQL volgens de openbare Jackcess-proef QueryTest (Apache-2.0), gelijk aan
 * scripts/database-corpusproef.mjs. Elk van de vijf queryTest-databases (V1997–V2010)
 * bevat deze negen query’s: samen de 45 verwachte Jackcess-query’s.
 */
export const JACKCESS: Record<string, string> = {
  SelectQuery:
    'SELECT DISTINCT Table1.*, Table2.col1, Table2.col2, Table3.col3\nFROM (Table1 LEFT JOIN Table3 ON Table1.col1 = Table3.col1) INNER JOIN Table2 ON (Table3.col1 = Table2.col2) AND (Table3.col1 = Table2.col1)\nWHERE (((Table2.col2)="foo" Or (Table2.col2) In ("buzz","bazz")))\nORDER BY Table2.col1;',
  DeleteQuery: 'DELETE Table1.col1, Table1.col2, Table1.col3\nFROM Table1\nWHERE (((Table1.col1)>"blah"));',
  AppendQuery:
    "INSERT INTO Table3 (col2, col2, col3)\nSELECT [Table1].[col2], [Table2].[col2], [Table2].[col3]\nFROM Table3, Table1 INNER JOIN Table2 ON [Table1].[col1]=[Table2].[col1];",
  UpdateQuery:
    'PARAMETERS User Name Text;\nUPDATE Table1\nSET Table1.col1 = "foo", Table1.col2 = [Table2].[col3], [Table2].[col1] = [User Name]\nWHERE ((([Table2].[col1]) Is Not Null));',
  MakeTableQuery:
    'SELECT Max(Table2.col1) AS MaxOfcol1, Table2.col2, Table3.col2 INTO Table4\nFROM (Table2 INNER JOIN Table1 ON Table2.col1 = Table1.col2) RIGHT JOIN Table3 ON Table1.col2 = Table3.col3\nGROUP BY Table2.col2, Table3.col2\nHAVING (((Max(Table2.col1))="buzz") AND ((Table2.col2)<>"blah"));',
  CrosstabQuery:
    'TRANSFORM Count([Table2].[col2]) AS CountOfcol2\nSELECT Table2_1.col1, [Table2].[col3], Avg(Table2_1.col2) AS AvgOfcol2\nFROM (Table1 INNER JOIN Table2 ON [Table1].[col1]=[Table2].[col1]) INNER JOIN Table2 AS Table2_1 ON [Table2].[col1]=Table2_1.col3\nWHERE ((([Table1].[col1])>"10") And ((Table2_1.col1) Is Not Null) And ((Avg(Table2_1.col2))>"10"))\nGROUP BY Table2_1.col1, [Table2].[col3]\nORDER BY [Table2].[col3]\nPIVOT [Table1].[col1];',
  UnionQuery:
    'Select Table1.col1, Table1.col2\nwhere Table1.col1 = "foo"\nUNION\nSelect Table2.col1, Table2.col2\nUNION ALL Select Table3.col1, Table3.col2\nwhere Table3.col3 > "blah";',
  PassthroughQuery: "ALTER TABLE Table4 DROP COLUMN col5;",
  DataDefinitionQuery: "CREATE TABLE Table5 (col1 CHAR, col2 CHAR);",
};
