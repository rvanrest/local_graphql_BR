'use strict';

const { queryOne, saveDb } = require('./db-helpers');

// ─── Database initialisation ──────────────────────────────────────────────────

function initDb(db, dbPath) {

  db.run(`
    CREATE TABLE IF NOT EXISTS Client (
      clientID         TEXT PRIMARY KEY,
      bsn              TEXT NOT NULL,
      leefeenheid      TEXT,
      huisarts         TEXT,
      communicatievorm TEXT,
      taal             TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Bemiddeling (
      bemiddelingID                    TEXT PRIMARY KEY,
      clientID                         TEXT NOT NULL,
      wlzIndicatieID                   TEXT NOT NULL,
      verantwoordelijkZorgkantoor      TEXT NOT NULL,
      verantwoordelijkheidIngangsdatum TEXT NOT NULL,
      verantwoordelijkheidEinddatum    TEXT,
      FOREIGN KEY (clientID) REFERENCES Client(clientID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Bemiddelingspecificatie (
      bemiddelingspecificatieID    TEXT PRIMARY KEY,
      bemiddelingID                TEXT NOT NULL,
      leveringsvorm                TEXT NOT NULL,
      zzpCode                      TEXT NOT NULL,
      toewijzingIngangsdatum       TEXT NOT NULL,
      instelling                   TEXT,
      uitvoerendZorgkantoor        TEXT NOT NULL,
      vaststellingMoment           TEXT NOT NULL,
      toewijzingEinddatum          TEXT,
      percentage                   INTEGER,
      pgbPercentage                INTEGER,
      opname                       TEXT,
      redenIntrekking              TEXT,
      etmalen                      TEXT,
      instellingBestemming         TEXT,
      soortToewijzing              TEXT NOT NULL,
      FOREIGN KEY (bemiddelingID) REFERENCES Bemiddeling(bemiddelingID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Overdracht (
      overdrachtID                 TEXT PRIMARY KEY,
      bemiddelingID                TEXT NOT NULL UNIQUE,
      verantwoordelijkZorgkantoor  TEXT NOT NULL,
      overdrachtDatum              TEXT NOT NULL,
      verhuisDatum                 TEXT NOT NULL,
      vaststellingMoment           TEXT NOT NULL,
      FOREIGN KEY (bemiddelingID) REFERENCES Bemiddeling(bemiddelingID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Overdrachtspecificatie (
      overdrachtspecificatieID             TEXT PRIMARY KEY,
      overdrachtID                         TEXT NOT NULL,
      bemiddelingspecificatieID            TEXT NOT NULL,
      leveringsstatus                      TEXT NOT NULL,
      leveringsstatusClassificatie         TEXT,
      oorspronkelijkeToewijzingEinddatum   TEXT,
      FOREIGN KEY (overdrachtID)              REFERENCES Overdracht(overdrachtID),
      FOREIGN KEY (bemiddelingspecificatieID) REFERENCES Bemiddelingspecificatie(bemiddelingspecificatieID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Regiehouder (
      regiehouderID TEXT PRIMARY KEY,
      bemiddelingID TEXT NOT NULL,
      instelling    TEXT NOT NULL,
      ingangsdatum  TEXT NOT NULL,
      einddatum     TEXT,
      regierol      TEXT NOT NULL,
      FOREIGN KEY (bemiddelingID) REFERENCES Bemiddeling(bemiddelingID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Contactpersoon (
      contactpersoonID         TEXT PRIMARY KEY,
      clientID                 TEXT NOT NULL,
      relatienummer            TEXT NOT NULL,
      volgorde                 INTEGER,
      soortRelatie             TEXT NOT NULL,
      rol                      TEXT,
      relatie                  TEXT,
      geslachtsnaam            TEXT,
      voorvoegselGeslachtsnaam TEXT,
      partnernaam              TEXT,
      voorvoegselPartnernaam   TEXT,
      voornamen                TEXT,
      voorletters              TEXT,
      roepnaam                 TEXT,
      naamgebruik              TEXT,
      geslacht                 TEXT,
      geboortedatum            TEXT,
      geboortedatumgebruik     TEXT,
      ingangsdatum             TEXT NOT NULL,
      einddatum                TEXT,
      FOREIGN KEY (clientID) REFERENCES Client(clientID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ClientContactgegevens (
      clientContactgegevensID TEXT PRIMARY KEY,
      clientID                TEXT NOT NULL,
      adressoort              TEXT NOT NULL,
      straatnaam              TEXT,
      huisnummer              INTEGER,
      huisletter              TEXT,
      huisnummertoevoeging    TEXT,
      postcode                TEXT,
      plaatsnaam              TEXT,
      land                    TEXT,
      aanduidingWoonadres     TEXT,
      emailadres              TEXT,
      telefoonnummer01        TEXT,
      landnummer01            TEXT,
      telefoonnummer02        TEXT,
      landnummer02            TEXT,
      ingangsdatum            TEXT NOT NULL,
      einddatum               TEXT,
      FOREIGN KEY (clientID) REFERENCES Client(clientID)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ContactpersoonContactgegevens (
      contactpersoonContactgegevensID TEXT PRIMARY KEY,
      contactpersoonID                TEXT NOT NULL,
      adressoort                      TEXT NOT NULL,
      straatnaam                      TEXT,
      huisnummer                      INTEGER,
      huisletter                      TEXT,
      huisnummertoevoeging            TEXT,
      postcode                        TEXT,
      plaatsnaam                      TEXT,
      land                            TEXT,
      aanduidingWoonadres             TEXT,
      emailadres                      TEXT,
      telefoonnummer01                TEXT,
      landnummer01                    TEXT,
      telefoonnummer02                TEXT,
      landnummer02                    TEXT,
      ingangsdatum                    TEXT NOT NULL,
      einddatum                       TEXT,
      FOREIGN KEY (contactpersoonID) REFERENCES Contactpersoon(contactpersoonID)
    )
  `);

  saveDb(db, dbPath);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function seedDb(db, dbPath) {
  const existing = queryOne(db, 'SELECT COUNT(*) as cnt FROM Client');
  if (existing && existing.cnt > 0) return;

  const clientID                        = 'aaaaaaaa-0001-4000-a000-000000000001';
  const bemiddelingID                   = 'aaaaaaaa-0002-4000-a000-000000000002';
  const bemiddelingspecificatieID       = 'aaaaaaaa-0003-4000-a000-000000000003';
  const overdrachtID                    = 'aaaaaaaa-0004-4000-a000-000000000004';
  const overdrachtspecificatieID        = 'aaaaaaaa-0005-4000-a000-000000000005';
  const regiehouderID                   = 'aaaaaaaa-0006-4000-a000-000000000006';
  const contactpersoonID                = 'aaaaaaaa-0007-4000-a000-000000000007';
  const clientContactgegevensID         = 'aaaaaaaa-0008-4000-a000-000000000008';
  const contactpersoonContactgegevensID = 'aaaaaaaa-0009-4000-a000-000000000009';
  const wlzIndicatieID                  = 'bbbbbbbb-0001-4000-b000-000000000001';

  db.run(`INSERT INTO Client VALUES (?,?,?,?,?,?)`, [
    clientID, '234567890', 'EENPERSOONS',
    'Huisartsenpraktijk De Linde', 'SCHRIFTELIJK', 'nl'
  ]);

  db.run(`INSERT INTO Bemiddeling VALUES (?,?,?,?,?,?)`, [
    bemiddelingID, clientID, wlzIndicatieID, 'VGZ', '2024-03-01', null
  ]);

  db.run(`INSERT INTO Bemiddelingspecificatie VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    bemiddelingspecificatieID, bemiddelingID,
    'VV', 'ZZP06', '2024-03-01', null,
    'Zorgcentrum De Eik', 'VGZ', '2024-02-20T09:00:00Z',
    100, null, 'J', null, null, null, 'REGULIER'
  ]);

  db.run(`INSERT INTO Overdracht VALUES (?,?,?,?,?,?)`, [
    overdrachtID, bemiddelingID, 'CZ',
    '2024-06-15', '2024-07-01', '2024-06-10T14:00:00Z'
  ]);

  db.run(`INSERT INTO Overdrachtspecificatie VALUES (?,?,?,?,?,?)`, [
    overdrachtspecificatieID, overdrachtID, bemiddelingspecificatieID,
    'ACTIEF', 'REGULIER', '2024-08-31'
  ]);

  db.run(`INSERT INTO Regiehouder VALUES (?,?,?,?,?,?)`, [
    regiehouderID, bemiddelingID,
    'Zorgcentrum De Eik', '2024-03-01', null, 'HOOFDAANNEMER'
  ]);

  db.run(`INSERT INTO Contactpersoon VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    contactpersoonID, clientID,
    'REL002', 1, 'PARTNER', null, null,
    'De Vries', null, null, null,
    'Anna', 'A.', 'An', 'E',
    'V', '1957-08-22', null,
    '2024-01-01', null
  ]);

  db.run(`INSERT INTO ClientContactgegevens VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    clientContactgegevensID, clientID,
    'WA', 'Kerkstraat', 5, null, null,
    '5678CD', 'Utrecht', 'NL', null,
    'a.devries@example.nl', '0301234567', '+31', null, null,
    '2024-01-01', null
  ]);

  db.run(`INSERT INTO ContactpersoonContactgegevens VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    contactpersoonContactgegevensID, contactpersoonID,
    'WA', 'Molenweg', 12, null, null,
    '5679EF', 'Utrecht', 'NL', null,
    'info@example.nl', '0612345678', '+31', null, null,
    '2024-01-01', null
  ]);

  saveDb(db, dbPath);
  console.log('  ✅  Seed data inserted');
}

module.exports = { initDb, seedDb };
