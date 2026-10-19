/**
 * ERA Access Database Importer
 *
 * Imports Microsoft Access (.accdb / .mdb) files into SQLite using
 * the `mdb-reader` npm package (pure JS, no native dependencies).
 *
 * Usage:
 *   import { importAccessToSqlite } from '@era/common/importer';
 *   const dbPath = await importAccessToSqlite('/path/to/file.accdb', '/output/dir');
 */

import { readFileSync } from 'fs';
import { basename, extname, join } from 'path';
import MDBReader from 'mdb-reader';
import Database from 'better-sqlite3';

/**
 * Map MDB/Access column types to SQLite column types.
 *
 * @param {string} type  The Access column type string from mdb-reader
 * @returns {string}     The corresponding SQLite type
 */
function mapColumnType(type) {
  switch (type) {
    case 'boolean':
      return 'INTEGER';
    case 'byte':
    case 'integer':
    case 'long':
    case 'repid':
      return 'INTEGER';
    case 'single':
    case 'double':
    case 'numeric':
    case 'currency':
      return 'REAL';
    case 'datetime':
      return 'DateTime';
    case 'text':
    case 'memo':
      return 'TEXT';
    case 'binary':
    case 'ole':
      return 'BLOB';
    default:
      return 'TEXT';
  }
}

/**
 * Escape a SQLite identifier (table / column name).
 *
 * @param {string} name
 * @returns {string}
 */
function escapeId(name) {
  return `\`${name.replace(/`/g, '``')}\``;
}

/**
 * Format a value for SQLite insertion.
 *
 * @param {*} value
 * @param {string} colType  The Access column type
 * @returns {*}  Value suitable for better-sqlite3 binding
 */
function formatValue(value, colType) {
  if (value === null || value === undefined) return null;

  if (colType === 'datetime' && value instanceof Date) {
    return value.toISOString().replace('T', ' ').replace('Z', '');
  }

  if (colType === 'boolean') {
    return value ? 1 : 0;
  }

  if (value instanceof Buffer || value instanceof Uint8Array) {
    return value;
  }

  return value;
}

/**
 * Import an Access (.accdb / .mdb) file into a new SQLite database.
 *
 * @param {string} accessFilePath  Path to the .accdb or .mdb file
 * @param {string} outputDir       Directory to write the .sqlite file
 * @param {Object} [options]
 * @param {string} [options.outputFileName]  Override output filename (default: same basename with .sqlite ext)
 * @param {boolean} [options.overwrite=false]  If true, overwrites existing .sqlite file
 * @returns {{ sqlitePath: string, tables: string[], rowCounts: Record<string, number> }}
 */
export function importAccessToSqlite(accessFilePath, outputDir, options = {}) {
  const { overwrite = false } = options;

  // Determine output path
  const baseName = options.outputFileName || basename(accessFilePath, extname(accessFilePath));
  const sqlitePath = join(outputDir, `${baseName}.sqlite`);

  // Read the Access file
  const buffer = readFileSync(accessFilePath);
  const mdb = new MDBReader(buffer);

  // Get table names (excluding system tables)
  const tableNames = mdb.getTableNames();

  // Open (or create) SQLite database
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');

  const rowCounts = {};

  // Wrap everything in a transaction for speed
  const importAll = db.transaction(() => {
    for (const tableName of tableNames) {
      const table = mdb.getTable(tableName);
      const columns = table.getColumns();

      if (columns.length === 0) continue;

      // Build CREATE TABLE statement
      const colDefs = columns.map((col) => {
        const sqliteType = mapColumnType(col.type);
        return `${escapeId(col.name)} ${sqliteType}`;
      });

      const escapedTableName = escapeId(tableName);

      if (overwrite) {
        db.prepare(`DROP TABLE IF EXISTS ${escapedTableName}`).run();
      }

      db.prepare(
        `CREATE TABLE IF NOT EXISTS ${escapedTableName} (${colDefs.join(', ')})`,
      ).run();

      // Read all data from the Access table
      const data = table.getData();

      if (data.length === 0) {
        rowCounts[tableName] = 0;
        continue;
      }

      // Build INSERT statement
      const placeholders = columns.map(() => '?').join(', ');
      const insertStmt = db.prepare(
        `INSERT INTO ${escapedTableName} VALUES (${placeholders})`,
      );

      // Insert rows
      for (const row of data) {
        const values = columns.map((col) =>
          formatValue(row[col.name], col.type),
        );
        insertStmt.run(...values);
      }

      rowCounts[tableName] = data.length;
    }
  });

  importAll();
  db.close();

  return { sqlitePath, tables: tableNames, rowCounts };
}

/**
 * Get metadata about an Access database without importing it.
 *
 * @param {string} accessFilePath  Path to the .accdb or .mdb file
 * @returns {{
 *   tables: Array<{ name: string, columns: Array<{ name: string, type: string }>, rowCount: number }>
 * }}
 */
export function inspectAccessDatabase(accessFilePath) {
  const buffer = readFileSync(accessFilePath);
  const mdb = new MDBReader(buffer);

  const tableNames = mdb.getTableNames();
  const tables = tableNames.map((name) => {
    const table = mdb.getTable(name);
    const columns = table.getColumns().map((col) => ({
      name: col.name,
      type: col.type,
    }));
    const rowCount = table.getData().length;
    return { name, columns, rowCount };
  });

  return { tables };
}
