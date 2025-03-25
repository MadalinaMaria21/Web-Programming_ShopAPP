const cookieParser=require('cookie-parser');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const app = express();
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const port = 6789;

const failedLoginAttempts = {};

app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use((req, res, next) => {
    res.locals.utilizator = req.cookies['utilizator'] || null;
    next();
});
app.use(express.static('public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure:false
    }
}));

const LOCK_TIME = 30 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;



app.get('/chestionar', (req, res) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now()
    
    if (timpRamas && timpRamas >  timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    }

    // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care
    //conține vectorul de întrebări
    res.render('chestionar', {intrebari: listaIntrebari});
});
const fs = require('fs');

var data = fs.readFileSync('intrebari.json');

listaIntrebari = JSON.parse(data);

app.post('/rezultat-chestionar', (req, res) => {
	//console.log(req.body);
	fs.readFile('intrebari.json', (err, data) => {
        if (err) {
            console.error('Eroare la citirea fișierului JSON:', err);
            return res.status(500).send('Eroare la citirea fișierului JSON');
        }
        
		var nr = 0;
		var i = 0;
		for (i in req.body) {
			console.log(listaIntrebari[parseInt(i.substring(1))].corect);
			if (req.body[i] == listaIntrebari[parseInt(i.substring(1))].corect) {
				nr++;
			}
		}
		console.log('Corecte:' + nr);
		res.render('rezultat-chestionar', { intrebari: listaIntrebari, raspunsuri: nr, raspunsuriUtilizator: req.body });
	});
});

app.get('/', (req, res) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now()
    
    if (timpRamas && timpRamas >  timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    }
    
    const dbPath = './cumparaturi.db';
    const connection = new sqlite3.Database(dbPath);

    const utilizator = req.session.numeLogat;
    connection.all("SELECT * FROM produse", (err, rows) => {
        if (err) {
            console.error('Eroare la interogarea produselor:', err);
            res.status(500).send('Eroare la interogarea produselor');
            connection.close();
            return;
        }

        res.render('index', { utilizator: utilizator, produse: rows, userR:req.session.userR });
        connection.close();
    });
});

app.post('/verificare-autentificare', (req, res) => {

    // Verificăm dacă utilizatorul este deja autentificat
    if (req.session.numeLogat) {
        return res.redirect('/'); // Redirecționăm către pagina principală dacă este autentificat
    }
    const { utilizator, parola } = req.body;
    const ip = req.ip;
    const timpCurent = Date.now();

    fs.readFile('utilizatori.json', (err, data) => {
        if (err) {
            return res.status(500).send('Eroare la citirea fișierului JSON');
        }

        var utilizatori = JSON.parse(data);
        let autentificareReusita = false;

        for (let i in utilizatori) {
            if (utilizator === utilizatori[i].userN && parola === utilizatori[i].userP) {
                autentificareReusita = true;
                req.session.numeLogat = utilizatori[i].userN;
                req.session.userR = utilizatori[i].userR;
                res.cookie('utilizator', utilizatori[i].userN, { maxAge: 180000, httpOnly: true });
                res.redirect('/');
                break;
            }
        }

        if (!autentificareReusita) {
            if (!failedLoginAttempts[ip]) {
                failedLoginAttempts[ip] = { attempts: 0, lastAttemptTime: 0, lockUntil: 0 };
            }

            failedLoginAttempts[ip].attempts++;
            failedLoginAttempts[ip].lastAttemptTime = timpCurent;

            if (failedLoginAttempts[ip].attempts % MAX_ATTEMPTS === 0) {
                failedLoginAttempts[ip].lockUntil = timpCurent + LOCK_TIME;
                res.cookie('timpRamas', failedLoginAttempts[ip].lockUntil, { maxAge: LOCK_TIME, httpOnly: true });
                return res.status(403).send('Acces temporar blocat din cauza încercărilor repetate de autentificare.');
            }

            res.cookie('mesajEroare', 'Numele utilizatorului sau parola sunt greșite!', { maxAge: 60000, httpOnly: true });
            res.clearCookie('utilizator');
            res.redirect('/autentificare');
        }
    });
});


app.get('/admin', (req, res) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now()
    
    if (timpRamas && timpRamas >  timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    }

    console.log("admin ->>", req.session.numeLogat ," + " , req.session.userR);
    res.render('admin', { numeLogat: req.session.numeLogat , userR: req.session.userR});
});


app.post('/delogare', (req, res) => {
    console.log('Butonul de delogare a fost apăsat');
    res.clearCookie('utilizator');
    req.session.destroy((err) => {
        if (err) {
            console.error('Eroare la delogare:', err);
            return res.status(500).send('Eroare la delogare');
        }
        console.log('Utilizator delogat cu succes');
        res.redirect('/');
    });
});

// Ruta pentru crearea bazei de date și tabelei produse
app.get('/creare-bd', (req, res) => {
    const dbPath = './cumparaturi.db';
    const connection = new sqlite3.Database(dbPath);

    connection.serialize(() => {
        // Șterge tabela dacă există
        connection.run(`DROP TABLE IF EXISTS produse`, (dropErr) => {
            if (dropErr) {
                console.error('Eroare la ștergerea tabelei:', dropErr);
                res.status(500).send('Eroare la ștergerea tabelei');
            } else {
                console.log('Tabela produse a fost ștearsă cu succes sau nu exista');
                // Creează tabela nouă
                connection.run(`CREATE TABLE produse (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nume TEXT NOT NULL,
                    pret REAL NOT NULL,
                    cantitate INTEGER NOT NULL,
                    imagine TEXT
                )`, (createErr) => {
                    if (createErr) {
                        console.error('Eroare la crearea tabelei:', createErr);
                        res.status(500).send('Eroare la crearea tabelei');
                    } else {
                        console.log('Tabela produse a fost creată cu succes');
                        res.redirect('/');
                    }
                    // Închide conexiunea aici, după ce toate operațiunile sunt finalizate
                    connection.close();
                });
            }
        });
    });
});

// Adăugăm ruta pentru inserarea produselor
app.get('/inserare-bd', (req, res) => {
    const dbPath = './cumparaturi.db';
    const connection = new sqlite3.Database(dbPath);

    const produse = [
        { nume: 'Ceai Lovare', pret: 36.00, cantitate: 10, imagine: 'imagini/poza1.png' },
        { nume: 'Ceai Lovare', pret: 36.00, cantitate: 10, imagine: 'imagini/poza2.png' },
        { nume: 'Ceai Lovare', pret: 36.00, cantitate: 10, imagine: 'imagini/poza3.png' },
        { nume: 'Ceai Lovare', pret: 36.00, cantitate: 10, imagine: 'imagini/poza4.png' },
        { nume: 'Ceai Lovare', pret: 16.00, cantitate: 10, imagine: 'imagini/poza5.png' },
        { nume: 'Ceai Lovare', pret: 16.00, cantitate: 10, imagine: 'imagini/poza6.png' },
        { nume: 'Ceai Lovare', pret: 16.00, cantitate: 10, imagine: 'imagini/poza7.png' },
        { nume: 'Ceai Lovare', pret: 16.00, cantitate: 10, imagine: 'imagini/poza8.png' },
        { nume: 'Cafea', pret: 56.00, cantitate: 10, imagine: 'imagini/poza9.png' },
        { nume: 'Cafea', pret: 46.00, cantitate: 10, imagine: 'imagini/poza10.png' },
        { nume: 'Cafea', pret: 55.00, cantitate: 10, imagine: 'imagini/poza11.png' },
        { nume: 'Cafea', pret: 31.00, cantitate: 10, imagine: 'imagini/poza12.png' },
        { nume: 'Cafea', pret: 48.00, cantitate: 10, imagine: 'imagini/poza13.png' },
        { nume: 'Cafea', pret: 56.00, cantitate: 10, imagine: 'imagini/poza14.png' },
        { nume: 'Cafea', pret: 33.00, cantitate: 10, imagine: 'imagini/poza15.png' },
        { nume: 'Cafea', pret: 27.00, cantitate: 10, imagine: 'imagini/poza16.png' },
    ];

    connection.serialize(() => {
        connection.run("DELETE FROM produse", (err) => {
            if (err) {
                console.error('Eroare la ștergerea produselor:', err);
                res.status(500).send('Eroare la ștergerea produselor');
                return;
            }

            console.log('Toate produsele au fost șterse din tabelă');

            const stmt = connection.prepare("INSERT INTO produse (nume, pret, cantitate, imagine) VALUES (?, ?, ?, ?)");

            produse.forEach((produs) => {
                stmt.run(produs.nume, produs.pret, produs.cantitate, produs.imagine, (err) => {
                    if (err) {
                        console.error('Eroare la inserarea produsului:', err);
                    }
                });
            });

            stmt.finalize((err) => {
                if (err) {
                    console.error('Eroare la finalizarea statement-ului:', err);
                    res.status(500).send('Eroare la inserarea produselor');
                } else {
                    console.log('Produsele au fost inserate cu succes');
                    connection.all("SELECT * FROM produse", (err, rows) => {
                        if (err) {
                            console.error('Eroare la interogarea produselor:', err);
                            res.status(500).send('Eroare la interogarea produselor');
                        } else {
                            res.redirect('/');
                        }
                        // Închide conexiunea după finalizarea interogării
                        connection.close();
                    });
                }
            });
        });
    });
});

app.post('/adaugare_cos', (req, res) => {
    const produsId = req.body.id;

    if (!req.session.cos) {
        req.session.cos = {};
    }

    if (req.session.cos[produsId]) {
        req.session.cos[produsId].cantitate++;
        res.redirect('/');
    } else {
        const dbPath = './cumparaturi.db';
        const connection = new sqlite3.Database(dbPath);
        connection.get("SELECT * FROM produse WHERE id = ?", [produsId], (err, row) => {
            if (err) {
                console.error('Eroare la interogarea produsului:', err);
                res.status(500).send('Eroare la interogarea produsului');
                return;
            }

            if (row) {
                req.session.cos[produsId] = { ...row, cantitate: 1 };
                console.log('Produs adăugat în coș:', produsId);
            }

            res.redirect('/');
            connection.close();
        });
    }
});

app.get('/vizualizare-cos', (req, res) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now()
    
    if (timpRamas && timpRamas >  timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    }

    if (!req.session.cos || Object.keys(req.session.cos).length === 0) {
        res.render('vizualizare-cos', { cos: {} });
        return;
    }

    res.render('vizualizare-cos', { cos: req.session.cos });
});

app.post('/eliminare_cos', (req, res) => {
    const produsId = req.body.id;

    if (req.session.cos && req.session.cos[produsId]) {
        if (req.session.cos[produsId].cantitate > 1) {
            req.session.cos[produsId].cantitate--;
        } else {
            delete req.session.cos[produsId];
        }
    }

    res.redirect('/vizualizare-cos');
});

app.post('/admin/adaugare-produs', (req, res) => {
    const dbPath = './cumparaturi.db';
    const connection = new sqlite3.Database(dbPath);

    const { nume, pret, cantitate, imagine } = req.body;

    const insertQuery = `INSERT INTO produse (nume, pret, cantitate, imagine) VALUES (?, ?, ?, ?)`;

    connection.run(insertQuery, [nume, pret, cantitate, imagine], function(err) {
        if (err) {
            console.error('Eroare la adăugarea produsului:', err);
            res.status(500).send('Eroare la adăugarea produsului');
            return;
        }

        console.log('Produsul a fost adăugat cu succes');
        res.redirect('/'); 
    });

    connection.close();
});

app.get('/autentificare', (req, res) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now()

    if (timpRamas && timpRamas >  timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    }
    if (req.session.numeLogat) {
        return res.redirect('/'); // Redirecționăm către pagina principală dacă este autentificat
    }
    res.render('autentificare', { mesajEroare: req.cookies.mesajEroare });
});

app.use((req, res, next) => {
    const timpRamas = Date.now() + 1*60*1000;

    res.cookie('timpRamas', timpRamas, { maxAge: 1*60*1000, httpOnly: true });
    res.status(404).send('Resursa nu a fost găsită.');
});





app.use((req, res, next) => {
    const timpRamas = req.cookies.timpRamas;
    const timpCurent = Date.now();

    if (timpRamas && timpRamas > timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării de accesare a unor resurse inexistente.');
    } else if (timpRamas && timpRamas <= timpCurent) {
        res.clearCookie('timpRamas'); 
    }
    next();
});







app.use((req, res, next) => {
    const ip = req.ip;
    const timpCurent = Date.now();

    if (!failedLoginAttempts[ip]) {
        failedLoginAttempts[ip] = { attempts: 0, lastAttemptTime: 0, lockUntil: 0 };
    }

    if (failedLoginAttempts[ip].lockUntil > timpCurent) {
        return res.status(403).send('Acces temporar blocat din cauza încercării repetate ale conectarii esuate.');
    }

    next();
});
app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:${port}`));