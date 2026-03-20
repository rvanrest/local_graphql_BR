# Graphql-server: Het Bemiddelingsregister
Met behulp van de onderstaande stappen en de bestanden uit deze repository kan er een graphql-server lokaal worden geinstantieerd zonder dat er admin-rechten nodig zijn. 

### **Inhoud**
1. [**Setup omgeving**](#setup-omgeving)
2. [**Bemiddelingsregister opstarten**](#bemiddelingsregister-opstarten) 
3. [**Beschikbare data**](#beschikbare-data)
4. [**Handige tooling**](#handige-tools)
5. [**Disclaimer toegangscontrole**](#disclaimer-toegangscontrole)

![GitHub Release](https://img.shields.io/github/v/release/rvanrest/local_graphql_BR?display_name=release)
![GitHub Release Date](https://img.shields.io/github/release-date/rvanrest/local_graphql_BR)


---

# Setup omgeving
De sleutel is het gebruik van een *portable* `Node.js` (een zip-distributie, geen installatie nodig) variant en door alles in één map te bewaren. 

Naast `node.js` (https://nodejs.org/en) maakt de installatie gebruik van `Yoga-graphql server` (https://the-guild.dev/graphql/yoga-server) en `SQLite3` (https://sqlite.org/index.html). 

Alleen `node.js` dient apart geïnstalleerd te worden. `Yoga-server` en `SQLite` worden mee geïnstalleerd via de GitHub download. 

### Stap 1: Portable Node.js downloaden en *installeren* 

1. Ga naar [nodejs.org/en/download](nodejs.org/en/download). 
2. Download het Windows-bestand (Standalone Binary (.zip)) — niet het installatieprogramma. (N.B. deze setup is gemaakt met v24.14.0(LTS))
3. Pak het uit op een locatie zoals bijvoorbeeld: `C:\graphql\node`  - Let op! NIET in een *sharepoint* of *onedrive* folder plaatsen!
4. Voeg de Node-map toe aan je PATH-variabele voor de huidige sessie met behulp van een batchbestand (zie stap 4), of verwijs er direct naar.

### Stap 2: Bemiddelingsregister downloaden en installeren

1. Ga naar [https://github.com/rvanrest/local_graphql_BR/](https://github.com/rvanrest/local_graphql_BR/)
2. Klik op in de rechter kolom op `Releases` 
3. Download de `Source code (zip)` van de laatste release 
4. Pak het bestand uit in een *nieuwe* folder onder de folder waar ook de folder `\node` staat zoals bijvoorbeeld in: `C:\graphql\iWlz-Bemiddelingsregister1` als node in `C:\graphql\node` staat.


### Stap 3. Benodigde `node_modules` installeren

1. Open het programma *Visual Studio Code* (VSC)
2. Open de installatie-folder waar het Bemiddelingsregister staat in VSC, (`Ctrl`+`K`, `Ctrl`+`O`) of (`File`> `Open Folder`),  *bijvoorbeeld: `C:\graphql\iWlz-Bemiddelingsregister1`*
3. Open een terminal-window (`Ctrl`+`Shift`+ `` ` `` ) of (`Terminal` > `New Terminal`). 
4. Controleer of het nieuwe terminal-window opent in jouw installatie-folder,  
   *bijvoorbeeld: `"PS C:\graphql\iWlz-Bemiddelingsregister1>"`*
5. Als dit niet het geval is zorg dan dat dit pad zichtbaar is in jouw terminal-window.
6. Voer vervolgens in de folder met de Bemiddelingsregister bestanden het volgende commando uit: 
   ```bash
    ..\node\npm config set strict-ssl false
   ```
   *(inclusief de twee punten vooraan)*
7. En daarna: 
   ```bash
    ..\node\npm install
   ```
   Als alles goed verloopt krijg je de volgende response:
   ```bash
    added 30 packages, and audited 31 packages in 1m11s

    found 0 vulnerabilities
    ```

    Na de installatie van alle benodigde modules zit de folder er als volgt uit:

    ```
    C:\graphql\
      ├── iWlz-Bemiddelingsregister1\
      │   ├── node_modules\                   ← directory met ondersteunende modules (oa. graphql-ondersteuning)
      │   ├── .gitignore                      ← (het kan zijn dat je dit bestand niet ziet, kan geen kwaad)
      │   ├── bemiddelingsregister.graphql    ← graphql-schema
      │   ├── bemiddelingsregisterDB.db       ← database, met testdata
      │   ├── db-helpers.js                   ← gedeelde sql.js utilities  
      │   ├── db.js                           ← tabel definities + seed data (wanneer er geen database-file aanwezig is)   
      │   ├── package-lock.json               ← npm package configuration
      │   ├── package.json                    ← npm package installation
      │   ├── README.md                       ← dit bestand
      │   ├── server_bemiddeling.js           ← server configuratie   
      │   └── start.bat                       ← om de omgeving op te starten start 
      └── node\                               ← directory met node-files
    ```

### Stap 4: Pas het opstart-bestand `start.bat` aan

Met `start.bat` wordt de lokale graphql-server omgeving opgestart. Deze moet eerst worden aangepast aan de lokale installatie situatie. 

1. Open het bestand in jouw text-editor (bijvoorbeeld VSC)
2. Pas (alleen) het pad naar de locatie van jouw `node` folder aan 
3. Sla het bestand op

De inhoud van `start.bat` ziet er na de aanpassing naar `C:\graphql\node` als volgt uit:

```bat
    @echo off
      SET PATH=C:\graphql\node;%PATH%
      cd /d %~dp0
      node server.js
      pause
```

### Stap 5: Opstarten Bemiddelingsregister
Je hebt nu alle benodigde stappen ondernomen om een GraphQL-server op te starten op basis van het schema van het Bemiddelingsregister. Ga hiervoor naar het volgende onderdeel [Bemiddelingsregister opstarten](#bemiddelingsregister-opstarten). 

---

# Bemiddelingsregister opstarten

Om de GraphQL omgeving met het Bemiddelingsregister lokaal op te starten gebruik je `start.bat`. Is deze correct aangepast naar de lokale omgeving en bevat die omgeving alle bestanden die nodig zijn dan is er een **Yoga GraphiQL** omgeving beschikbaar op: [http://localhost:4000/graphql](http://localhost:4000/graphql)

We maken gebruik van het programma *Visual Studio Code* om de server op te starten. 

1. Open het programma *Visual Studio Code* (VSC)
2. Open de installatie-folder waar het Bemiddelingsregister staat in VSC, (`Ctrl`+`K`, `Ctrl`+`O`) of (`File`> `Open Folder`),  *bijvoorbeeld: `C:\graphql\iWlz-Bemiddelingsregister1`*
3. Open een terminal-window (`Ctrl`+`Shift`+ `` ` `` ) of (`Terminal` > `New Terminal`). 
4. Controleer of het nieuwe terminal-window opent in jouw installatie-folder, *bijvoorbeeld: `C:\graphql\iWlz-Bemiddelingsregister1`*
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
    of 
    ```json
    {
      "bemiddelingspecificatieID": "8bcba75f-c44e-4f7d-ae8f-f0912757c6b2",
      "instelling": "54540707",
      "toewijzingIngangsdatum": "2021-05-07",
      "vaststellingMoment": "2021-09-07T00:00:00.000+01:00",
      "dagVaststellingMoment": "2021-09-07",
      "toewijzingEinddatum": "2021-09-07"
    }
    ```
4. Press Play en bekijk het resultaat.

---


# Beschikbare data
De data in de database ([bemiddelingsregisterDB.db](bemiddelingsregisterDB.db) is gebaseerd op de *casuïstiek* van het Estafettemodel iWlz 2.4.3, omgezet naar het netwerkmodel. Hieronder volgt een overzicht en mapping naar de verschillende casuïstiek. Er is een extra casus toegevoegd om `Overdracht` te vullen.

Een overzicht met de beschikbare testdata is te vinden in het [**overzicht beschikbare data**](beschikbare_data.md). 

Raadpleeg de data door middel van GraphQL of gebruik een SQLite viewer. Dit kan door het installeren van een extensie in Visual Studio Code ([SQLite3 Editor](https://marketplace.visualstudio.com/items?itemName=yy0931.vscode-sqlite3-editor)) of met [DB Browser for SQLite - Portable](https://portableapps.com/apps/development/sqlite_database_browser_portable).

## Disclaimer toegangscontrole
> [!WARNING]
> Deze installatie bestaat alleen uit een GraphQL-server zodat er queries uitgevoerd kunnen worden en getest op een gewenst resultaat. De toegangscontrole of het uitvoering van policies is **GEEN** onderdeel van deze installatie. 
>
> Een zorgaanbieder kan dus gewoon het percentage pgb opvragen omdat hier controle op is. 