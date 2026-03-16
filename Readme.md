# Graphql-server: Het Bemiddelingsregister
Met behulp van de onderstaande stappen en de bestanden uit deze repository kan er een graphql-server lokaal worden geinstantieerd zonder dat er admin-rechten nodig zijn. 

### **Inhoud**
1. [**Setup omgeving**](#setup-omgeving)
2. [**Bemiddelingsregister opstarten**](#bemiddelingsregister-opstarten) 
3. [**Beschikbare data**]
4. [**Handige tooling**]
5. Meer informatie

## Setup omgeving
De sleutel is het gebruik van een *portable* `Node.js` (een zip-distributie, geen installatie nodig) variant en door alles in één map te bewaren. 

Naast `node.js` (https://nodejs.org/en) maakt de installatie gebruik van `Yoga-graphql server` (https://the-guild.dev/graphql/yoga-server) en `SQLite3` (https://sqlite.org/index.html). 

Alleen `node.js` dient apart geïnstalleerd te worden. `Yoga-server` en `SQLite` worden mee geïnstalleerd via de GitHub download. 

### Stap 1: Portable Node.js downloaden en *installeren* 

1. Ga naar [nodejs.org/en/download](nodejs.org/en/download). 
2. Download het Windows-bestand (Standalone Binary (.zip)) — niet het installatieprogramma. (N.B. deze setup is gemaakt met v24.14.0(LTS))
3. Pak het uit op een locatie zoals `D:\graphql\node`  - Let op! NIET in een *sharepoint* of *onedrive* folder plaatsten
4. Voeg de Node-map toe aan je PATH voor de huidige sessie met behulp van een batchbestand (zie hieronder), of verwijs er direct naar.

### Stap 2: Bemiddelingsregister downloaden en installeren

1. Ga naar [github.com/rvanrest/LocalBemiddelingsregister/releases]()
2. Download het de laatste release (.zip)
3. Pak het uit op de locatie waar ook `node` staat zoals `D:\graphql\iWlz-Bemiddelingsregister1`


Wanneer de installatie goed is gedaan heb je onder jouw gekozen root-directory (`D:\graphql`) de volgende structuur:
```
D:\graphql\
  ├── iWlz-Bemiddelingsregister1\
  │   ├── node_modules\                   ← directory met ondersteunende modules (oa. graphql-ondersteuning)
  │   ├── bemiddelingsregister.graphql    ← graphql-schema
  │   ├── bemiddelingsregisterDB.db       ← database, met testdata
  │   ├── db-helpers.js                   ← gedeelde sql.js utilities  
  │   ├── db.js                           ← tabel definities + seed data (wanneer er geen database-file aanwezig is)   
  │   ├── package-lock.json               ← 
  │   ├── package.json                    ← 
  │   ├── readme.md                       ← dit bestand
  │   ├── server_bemiddeling.js           ← server configuratie   
  │   └── start.bat                       ← om de omgeving op te starten start 
  └── node\                               ← directory met node-files
```

### Stap 3: Pas het opstart-bestand `start.bat` aan

Met `start.bat` wordt de lokale graphql-server omgeving opgestart. Deze moet eerst worden aangepast aan de lokale installatie situatie. 

1. Open het bestand in jouw text-editor (bijvoorbeeld VSC)
2. Pas (alleen) het pad naar de locatie van jouw `node` folder aan 
3. Sla het bestand op

De inhoud van `start.bat` ziet er na de aanpassing naar `D:\graphql\node` als volgt uit:
```bat
  @echo off
  SET PATH=D:\graphql\node;%PATH%
  cd /d %~dp0
  node server.js
  pause
```



## Bemiddelingsregister opstarten

Om de GraphQL omgeving met het Bemiddelingsregister lokaal op te starten gebruik je `start.bat`. Is deze correct aangepast naar de lokale omgeving en bevat die omgeving alle bestanden die nodig zijn dan is er een **Yoga GraphiQL** omgeving beschikbaar op: [http://localhost:4000/graphql](http://localhost:4000/graphql)

We maken gebruik van het programma *Visual Studio Code* om de server op te starten. 

1. Open het programma *Visual Studio Code* (VSC)
2. Open de installatie-folder waar het Bemiddelingsregister staat in VSC, (`Ctrl`+`K`, `Ctrl`+`O`) of (`File`> `Open Folder`),  *bijvoorbeeld: `D:\graphql\iWlz-Bemiddelingsregister1`*
3. Open een terminal-window (`Ctrl`+`Shift`+ `` ` `` ) of (`Terminal` > `New Terminal`). 
4. Controleer of het nieuwe terminal-window opent in jouw installatie-folder, *bijvoorbeeld: `D:\graphql\iWlz-Bemiddelingsregister1`*
5. Als dit niet het geval is zorg dan dat dit pad zichtbaar is in jouw terminal-window.
6. Controleer of het bestand `start.bat` aanwezig is. Type hiervoor `dir` in het terminal-window en druk op [`enter`]. Je krijgt dan een lijst, die overeenkomt met de lijst in VSC. 
7. Klopt alles, type dan `.\start.bat` in het terminal-window (inclusief punt en backslash) en druk op [`enter`]
8. Wanneer alles correct is geïnstalleerd en aangepast wordt er een Yoga-GraphQL server opgestart en verschijnt (*na enkele seconden*) onderstaande in het terminal-window:  

    ```bash
      ✅  iWlz Bemiddelingsregister GraphQL server running
      🌐  http://localhost:4000/graphql

      Probeer deze query in GraphiQL:

      query test {
        bemiddelingspecificatie(
          where: {
            bemiddelingspecificatieID: {eq: "aaaaaaaa-0003-4000-a000-000000000003"}
          }
        ) {
          bemiddelingspecificatieID
          toewijzingIngangsdatum
          toewijzingEinddatum
          soortToewijzing
          bemiddeling {
            bemiddelingID
            verantwoordelijkZorgkantoor
          }
        }
      }


      Om de server te stoppen, druk op Ctrl+C
    ```
9. Open http://localhost:4000/graphql in je browser
10. Plak de test-query in het query venster en "Press play" of (`Ctrl`+`Enter`). Je krijgt dan als alles werkt de volgende response
    ```json
    {
      "data": {
        "bemiddelingspecificatie": [
          {
            "bemiddelingspecificatieID": "aaaaaaaa-0003-4000-a000-000000000003",
            "toewijzingIngangsdatum": "2024-03-01",
            "toewijzingEinddatum": "2024-02-20T09:00:00Z",
            "soortToewijzing": "REGULIER",
            "bemiddeling": {
              "bemiddelingID": "aaaaaaaa-0002-4000-a000-000000000002",
              "verantwoordelijkZorgkantoor": "VGZ"
            }
          }
        ]
      }
    }
    ```
11. Je kan nu GraphQL-queries testen op basis van de gegevens in de database. Zie onder [**Data in het register**](#data-in-het-register), welke situaties er beschikbaar zijn. 
12. Om de server weer af te sluiten toets je in het Terminal-window: [`Ctrl`+ `C`]

#### Extra test
Zorg dat de Graphql-server draait.

1. Ga naar de koppelvlakspecificatie van het [Bemiddelingsregister](https://github.com/iStandaarden/iWlz-bemiddeling/) en kopieer (raw-copy) daar de inhoud van: `QBR-0002-ZA.graphql`
2. Plak de query in het query-venster
3. Plak de onderstaande json in het venster *Variables* onderop het query-venster
   ```json
    {
      "bemiddelingspecificatieID": "4c46c5dc-489e-40e1-9d8f-ba2881112e8f",
      "instelling": "51510101",
      "toewijzingIngangsdatum": "2022-01-01",
      "vaststellingMoment": "2022-01-01T00:00:00.000+01:00",
      "dagVaststellingMoment": "2022-01-01",
      "toewijzingEinddatum": "2022-12-31"
    }
   ```

---

Got it. This is the Dutch Wlz (long-term care) Indicatieregister schema — a read-only (Query only, no Mutations) schema with a deeply nested structure. Let me build the full solution.Now let me build the complete solution — the schema file, the SQLite table setup, and the full server with resolvers for this deeply nested structure:Here's what was built and why each decision was made:

**Database structure** — The schema's nested types are mapped to 13 relational SQLite tables with foreign keys. `WlzIndicatie` is the root, with everything hanging off it via `wlzindicatieID`. `ContactGegevens` links to either a `Client` or a `ContactPersoon` (nullable FKs), mirroring how the schema uses it for both.

**Resolvers** — Every nested type gets its own resolver that does a targeted SQL lookup by parent ID. So querying `client.contactGegevens.adres` triggers three separate focused queries — clean, lazy, and no over-fetching.

**Filter support** — The `WlzIndicatieFilterInput` from the schema is fully implemented, supporting `eq` filters on `wlzindicatieID`, `bsn`, `besluitnummer`, `initieelVerantwoordelijkZorgkantoor`, `afgiftedatum` and `ingangsdatum`.

**Deprecated fields** — Fields marked `@deprecated` in the schema (like `id` on most types) still resolve correctly — they just point to the same value as the new ID field.

**Seed data** — One complete `WlzIndicatie` record is inserted on first run so you can immediately test queries in GraphiQL without needing to add data first.

Just drop this `server.js` into your project folder alongside the original `schema.graphql` file (save the raw GitHub content as `schema.graphql`), then run `node server.js`.

## Data in het register
De beschikbare data is gebaseerd op de *casuistiek* van het Estafettemodel iWlz 2.4.3, omgezet naar het netwerkmodel. Hieronder volgt een overzicht en mapping naar de verschillende casuistiek. Er is een extra casus toegevoegd om `Overdracht` te vullen.




## Overige tools


