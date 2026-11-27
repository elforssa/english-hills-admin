import Image from 'next/image';

// Static French guide for the reception team, served at /helpdesk.
// Source of truth for the content: this file. Screenshots live in public/helpdesk (synthetic data only).
// Keep button and menu names exactly as they appear on screen; scripts/test-helpdesk-content.mjs checks anchors and images.
// The screenshots in public/helpdesk are public static files (no login needed to fetch them): they must contain synthetic data only.
export default function GuideContent() {
  return (
    <>
<header className="hero">
<p className="eyebrow">English Hills · Espace Accueil</p>
<h1>Guide Accueil</h1>
<p className="lead">Tout ce qu’il faut savoir pour travailler dans votre espace de la plateforme&nbsp;: suivre les prospects jusqu’à l’inscription, puis gérer au quotidien les apprenants, les paiements, les groupes, les présences et les enseignants.</p>
<ul className="chips">
<li>Version 2.6</li>
<li>22 novembre 2026</li>
<li>Heures de Casablanca</li>
<li>Captures sur données fictives</li>
</ul>
<div className="callout info" style={{ marginTop: '22px' }}>
<strong>Comment lire ce guide</strong><p>Le guide a <b>deux parties</b>, comme votre travail. Les noms de boutons et de menus sont écrits comme à l’écran, dans un cadre&nbsp;: <span className="ui">Enregistrer</span>. Chaque scénario part d’une situation réelle et indique le chemin, étape par étape. Les parties «&nbsp;Référence&nbsp;» servent à retrouver un écran ou un mot précis.</p>
<p>Ce guide décrit votre espace uniquement. Si un écran ne ressemble plus à une capture, la plateforme a évolué&nbsp;: signalez-le à la direction.</p>
</div>
<div className="cols" style={{ marginTop: '18px' }}>
<div className="card">
<h4>Partie 1 · Prospects (CRM)</h4>
<p>Vous passez ici l’essentiel de votre temps&nbsp;: de la première demande à l’inscription payée.</p>
<ul className="tight">
<li><a href="#c1">C1</a> Un nouveau prospect · <a href="#c2">C2</a> J’appelle · <a href="#c3">C3</a> On a parlé</li>
<li><a href="#c4">C4</a> Rendez-vous et test · <a href="#c5">C5</a> Changer · <a href="#c6">C6</a> Inscrire · <a href="#c7">C7</a> Clôturer</li>
</ul>
</div>
<div className="card">
<h4>Partie 2 · Au quotidien</h4>
<p>Dès que la personne est inscrite, ou se présente au guichet&nbsp;: dossiers, paiements, groupes, présences, enseignants.</p>
<ul className="tight">
<li><a href="#q1">Q1–Q2</a> Apprenants et dossiers · <a href="#q3">Q3–Q7</a> Paiements, reçus, inscriptions</li>
<li><a href="#q8">Q8–Q10</a> Groupes · <a href="#q11">Q11</a> Présences · <a href="#q12">Q12–Q13</a> Enseignants et horaires · <a href="#q14">Q14</a> Rentrée et fin de mois</li>
</ul>
</div>
</div>
</header>
<section className="part" id="prise-en-main">
<header>
<h2>Prise en main</h2>
</header>
<h3 id="connexion">Se connecter et se déconnecter</h3>
<ol className="steps">
<li><p>Ouvrez l’adresse de la plateforme, puis remplissez <span className="ui">Adresse email</span> et <span className="ui">Mot de passe</span>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Se connecter</span>. Vous arrivez sur la page <b>Opportunités</b>, votre page d’accueil.</p>
</li>
</ol>
<ul className="tight">
<li>Mot de passe oublié&nbsp;: <span className="ui">Mot de passe oublié&nbsp;?</span> sous le champ du mot de passe.</li>
<li>Autre option&nbsp;: <span className="ui">Recevoir un lien de connexion</span>, en bas de la page. Vous recevez un lien par email, valable 1 heure&nbsp;; ouvrez-le puis appuyez sur <span className="ui">Se connecter</span>. Pour choisir un nouveau mot de passe, utilisez plutôt <span className="ui">Mot de passe oublié&nbsp;?</span>.</li>
<li>Pour quitter&nbsp;: <span className="ui">Déconnexion</span>, en bas du menu de gauche. Il n’y a pas de message de confirmation.</li>
</ul>
<div className="callout warn">
<strong>Pas de changement de mot de passe dans «&nbsp;Mon compte&nbsp;»</strong><p>La page <span className="menu">Mon compte</span> permet de modifier votre nom et votre téléphone seulement. Pour un nouveau mot de passe, passez par <span className="ui">Mot de passe oublié&nbsp;?</span> ou demandez à la direction.</p>
</div>
<h4 id="connexion-impossible">L’écran «&nbsp;Connexion impossible&nbsp;»</h4>
<p>Il apparaît quand la plateforme n’arrive pas à charger votre compte à cause d’un problème de connexion (Internet coupé ou lent, serveur momentanément indisponible). Vos accès ne sont pas modifiés et rien n’est enregistré tant que l’écran est affiché.</p>
<ol className="steps">
<li><p>Vérifiez votre connexion Internet (Wi-Fi, câble).</p>
</li>
<li><p>Cliquez sur <span className="ui">Réessayer</span>. Si la connexion est revenue, la page s’affiche normalement.</p>
</li>
<li><p>Si l’écran revient, cliquez sur <span className="ui">Se déconnecter</span>, puis reconnectez-vous. Si cela continue, prévenez la direction.</p>
</li>
</ol>
<p>Une variante s’affiche parfois en ouvrant une page&nbsp;: «&nbsp;Connexion impossible, nouvel essai…&nbsp;». Elle réessaie toute seule après quelques secondes&nbsp;; vous pouvez aussi cliquer sur <span className="ui">Réessayer maintenant</span>.</p>
<div className="callout warn">
<strong>Un paiement était en cours&nbsp;?</strong><p>Si l’écran est apparu juste après un clic sur <span className="ui">Enregistrer et générer le reçu</span>, ne ressaisissez pas le paiement&nbsp;: une fois reconnectée, ouvrez d’abord les reçus de l’apprenant (<a href="#q6">Q6</a>).</p>
</div>
<h3 id="menu">Votre page d’accueil et votre menu</h3>
<figure className="fig">
<Image src="/helpdesk/s01-board.jpg" width={1700} height={1075} alt="Page Opportunités avec le menu de gauche, les vues, le bouton Ajouter un prospect et cinq colonnes de prospects" unoptimized tabIndex={0} role="button" /><figcaption>La page d’accueil&nbsp;: le tableau des prospects, par étape.</figcaption>
<ol className="legend">
<li>Le menu <span className="menu">CRM</span> contient <span className="menu">Opportunités</span> (cette page) et <span className="menu">Tâches</span>.</li>
<li>Les <b>onglets</b>&nbsp;: <span className="ui">Tous</span>, <span className="ui">Mes prospects</span>, <span className="ui">À prendre</span> (ceux que personne n’a encore pris) et <span className="ui">Clôturés</span>. Chaque carte porte le nom du responsable, ou «&nbsp;À prendre&nbsp;».</li>
<li><span className="ui">Ajouter un prospect</span>&nbsp;: pour un appel ou une visite qui n’est pas arrivé par un formulaire.</li>
<li>Les colonnes sont les <b>étapes</b> du prospect, de gauche à droite.</li>
</ol>
</figure>
<div className="scroll">
<table>
<thead>
<tr>
<th>Menu</th>
<th>Entrées</th>
<th>Pour quoi faire</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>CRM</b></td>
<td><span className="menu">Opportunités</span><br /><span className="menu">Tâches</span> (page «&nbsp;Tâches · Mon travail&nbsp;»)</td>
<td>Suivre les prospects et vos actions du jour.</td>
</tr>
<tr>
<td><b>Admissions</b></td>
<td><span className="menu">Tests de niveau</span><br /><span className="menu">Calendrier</span> (page «&nbsp;Calendrier admissions&nbsp;»)</td>
<td>Organiser les tests et les visites.</td>
</tr>
<tr>
<td><b>Apprenants</b></td>
<td><span className="menu">Liste des apprenants</span> (vues <span className="ui">Tableau</span> et <span className="ui">Cartes</span>)<br /><span className="menu">Ajouter un apprenant</span></td>
<td>Retrouver un apprenant, créer ou compléter un dossier, voir son solde, lui affecter un groupe.</td>
</tr>
<tr>
<td><b>Académique</b></td>
<td><span className="menu">Groupes &amp; niveaux</span><br /><span className="menu">Présences</span><br /><span className="menu">Emploi du temps</span><br /><span className="menu">Notes &amp; bulletins</span></td>
<td>Créer et modifier les groupes, prendre les présences, consulter les horaires, saisir les notes et imprimer les bulletins.</td>
</tr>
<tr>
<td><b>Finance</b></td>
<td><span className="menu">Nouveau reçu</span> (page «&nbsp;Encaisser un paiement&nbsp;»)<br /><span className="menu">Tous les reçus</span> (page «&nbsp;Reçus de paiement&nbsp;»)</td>
<td>Encaisser, imprimer, retrouver, renvoyer un reçu.</td>
</tr>
<tr>
<td><b>Enseignants</b></td>
<td><span className="menu">Liste des enseignants</span></td>
<td>Ajouter un enseignant, modifier ses coordonnées, ses niveaux et ses certifications. Jamais les salaires.</td>
</tr>
<tr>
<td><b>Mon compte</b></td>
<td>Votre nom et votre téléphone</td>
<td>Mettre à jour vos informations.</td>
</tr>
</tbody>
</table>
</div>
<p>Certains titres de page diffèrent du nom dans le menu, comme indiqué ci-dessus. C’est normal.</p>
<p><b>Les deux parties se répondent.</b> Un prospect payé devient un apprenant&nbsp;: la partie 1 s’arrête au paiement (<a href="#c6">C6</a>), la partie 2 continue avec le groupe, les présences et le suivi des paiements. Les menus <span className="menu">CRM</span>, <span className="menu">Tests de niveau</span> et <span className="menu">Calendrier</span> relèvent de la partie 1&nbsp;; <span className="menu">Apprenants</span>, <span className="menu">Inscriptions</span>, <span className="menu">Académique</span>, <span className="menu">Finance</span> et <span className="menu">Enseignants</span> de la partie 2.</p>
<h3 id="jeveux">Je veux… où dois-je aller&nbsp;?</h3>
<h4>Prospects (partie 1)</h4>
<div className="scroll">
<table>
<thead>
<tr>
<th>Je veux</th>
<th>Je vais dans</th>
<th>Détail</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ajouter un prospect qui vient d’appeler ou de passer</td>
<td><span className="menu">Opportunités</span> › <span className="ui">Ajouter un prospect</span></td>
<td><a href="#c1">Scénario C1</a></td>
</tr>
<tr>
<td>Noter un appel ou un échange</td>
<td><span className="menu">Tâches</span> ou la fiche du prospect › <span className="ui">Pas de réponse</span> ou <span className="ui">Noter un échange</span></td>
<td><a href="#c2">Scénario C2</a></td>
</tr>
<tr>
<td>Réserver un rendez-vous ou un test de niveau pour un prospect</td>
<td>Fiche du prospect › <span className="ui">Noter un échange</span> › <span className="ui">Rendez-vous au centre</span> (avec test si besoin)</td>
<td><a href="#c4">Scénario C4</a></td>
</tr>
<tr>
<td>Voir les tests et visites de la semaine</td>
<td><span className="menu">Admissions</span> › <span className="menu">Calendrier</span></td>
<td><a href="#c4">Scénario C4</a></td>
</tr>
<tr>
<td>Inscrire un prospect qualifié</td>
<td>Fiche du prospect › <span className="ui">Inscrire et encaisser</span></td>
<td><a href="#c6">Scénario C6</a></td>
</tr>
<tr>
<td>Clôturer ou rouvrir un prospect</td>
<td>Fiche du prospect › <span className="ui">Autres actions</span></td>
<td><a href="#c7">Scénario C7</a></td>
</tr>
<tr>
<td>Une famille&nbsp;: plusieurs enfants, du test à l’inscription</td>
<td><span className="ui">Ajouter un prospect</span>, puis <span className="ui">Autres actions</span> › <span className="ui">Ajouter un enfant</span></td>
<td><a href="#c8">Scénario C8</a></td>
</tr>
</tbody>
</table>
</div>
<h4>Au quotidien (partie 2)</h4>
<div className="scroll">
<table>
<thead>
<tr>
<th>Je veux</th>
<th>Je vais dans</th>
<th>Détail</th>
</tr>
</thead>
<tbody>
<tr>
<td>Retrouver un apprenant, même avec son téléphone</td>
<td><span className="menu">Apprenants</span> › <span className="menu">Liste des apprenants</span>, vue <span className="ui">Cartes</span></td>
<td><a href="#q1">Scénario Q1</a></td>
</tr>
<tr>
<td>Créer un dossier, le compléter, ajouter un document</td>
<td><span className="menu">Ajouter un apprenant</span> · fiche › <span className="ui">Modifier</span></td>
<td><a href="#q2">Scénario Q2</a></td>
</tr>
<tr>
<td>Encaisser pour quelqu’un qui se présente au guichet</td>
<td><span className="menu">Finance</span> › <span className="menu">Nouveau reçu</span></td>
<td><a href="#q3">Scénario Q3</a></td>
</tr>
<tr>
<td>Encaisser la suite d’un paiement</td>
<td>Fiche de l’apprenant › <span className="ui">Encaisser</span></td>
<td><a href="#q4">Scénario Q4</a></td>
</tr>
<tr>
<td>Voir qui n’a pas fini de payer</td>
<td><span className="menu">Liste des apprenants</span> › <span className="ui">Plus de filtres</span> › <span className="ui">Filtrer par paiement</span></td>
<td><a href="#q5">Scénario Q5</a></td>
</tr>
<tr>
<td>Retrouver un reçu, le réimprimer, le renvoyer</td>
<td><span className="menu">Finance</span> › <span className="menu">Tous les reçus</span></td>
<td><a href="#q6">Scénario Q6</a></td>
</tr>
<tr>
<td>Inscrire un apprenant qui a déjà un dossier</td>
<td>Fiche de l’apprenant › <span className="ui">Inscrire et encaisser</span></td>
<td><a href="#q7">Scénario Q7</a></td>
</tr>
<tr>
<td>Créer un groupe, changer son enseignant, son horaire ou sa salle</td>
<td><span className="menu">Académique</span> › <span className="menu">Groupes &amp; niveaux</span></td>
<td><a href="#q8">Scénario Q8</a></td>
</tr>
<tr>
<td>Mettre un apprenant dans un groupe</td>
<td><span className="menu">Liste des apprenants</span> › <span className="ui">Groupe à affecter</span></td>
<td><a href="#q9">Scénario Q9</a></td>
</tr>
<tr>
<td>Changer un apprenant de groupe, ou le retirer d’un groupe</td>
<td>Fiche › <span className="ui">Modifier l’inscription</span> · page du groupe › <span className="ui">Retirer</span></td>
<td><a href="#q10">Scénario Q10</a></td>
</tr>
<tr>
<td>Noter les absents, retrouver une ancienne séance</td>
<td><span className="menu">Académique</span> › <span className="menu">Présences</span></td>
<td><a href="#q11">Scénario Q11</a></td>
</tr>
<tr>
<td>Consulter ou corriger la fiche d’un enseignant</td>
<td><span className="menu">Enseignants</span> › <span className="menu">Liste des enseignants</span></td>
<td><a href="#q12">Scénario Q12</a></td>
</tr>
<tr>
<td>Ajouter un nouvel enseignant</td>
<td><span className="menu">Enseignants</span> › <span className="ui">Ajouter</span></td>
<td><a href="#q12">Scénario Q12</a></td>
</tr>
<tr>
<td>Savoir quel groupe a cours quand, avec qui et dans quelle salle</td>
<td><span className="menu">Académique</span> › <span className="menu">Emploi du temps</span></td>
<td><a href="#q13">Scénario Q13</a></td>
</tr>
<tr>
<td>Préparer la rentrée ou faire le point de fin de mois</td>
<td>Plusieurs écrans</td>
<td><a href="#q14">Scénario Q14</a></td>
</tr>
</tbody>
</table>
</div>
<h3 id="invisible">Ce que vous ne verrez pas</h3>
<p>Votre espace est limité aux opérations du quotidien. Ces éléments existent dans la plateforme mais ne sont pas pour vous&nbsp;: l’analyse marketing, le suivi Meta, le tableau de bord financier et les chiffres d’encaissement, la paie et les salaires des enseignants, la décision sur les congés, les conversations entre la direction et les enseignants ou entre les familles et les enseignants, la gestion des utilisateurs et les paramètres du centre. Dans «&nbsp;Messages &amp; Annonces&nbsp;», vous voyez les messages entre le bureau et les familles, et ceux que vous avez envoyés ou reçus.</p>
<div className="callout info">
<strong>Une page vous ramène à «&nbsp;Opportunités&nbsp;» sans rien dire&nbsp;?</strong><p>C’est normal. Quand vous ouvrez une adresse qui ne fait pas partie de votre espace (un ancien lien, une page de la direction), la plateforme vous renvoie à votre page d’accueil sans message d’erreur.</p>
</div>
<h3 id="reflexes">Les six réflexes</h3>
<ul className="rules">
<li><b>Copier un numéro n’enregistre rien.</b><p>Après chaque appel ou conversation, notez-le&nbsp;: <span className="ui">Pas de réponse</span> en un clic, sinon <span className="ui">Noter un échange</span>. C’est ce qui fait avancer le prospect et planifie la suite.</p>
</li>
<li><b>Chercher avant de créer.</b><p>Avant d’ajouter un prospect ou un apprenant, cherchez-le. La plateforme ne bloque jamais un doublon sur «&nbsp;Ajouter un apprenant&nbsp;».</p>
</li>
<li><b>Un reçu ne se modifie pas.</b><p>En cas d’erreur de montant, de personne ou de prix, la direction annule le paiement. Vous le ressaisissez ensuite.</p>
</li>
<li><b>Un paiement confirme l’inscription.</b><p>Une inscription n’existe qu’une fois payée&nbsp;: tout montant supérieur à zéro la confirme, une remise de 100&nbsp;% avec son motif aussi (<a href="#regles-paiement">règles de paiement</a>). Sans paiement, rien n’est créé. Le groupe se choisit au même moment ou plus tard.</p>
</li>
<li><b>Après un clic sur Enregistrer, ne recommencez pas.</b><p>Si un message dit «&nbsp;Impossible de confirmer l’enregistrement&nbsp;», relancez <span className="ui">Enregistrer</span> sans rien modifier. Pour un paiement, vérifiez d’abord les reçus de l’apprenant.</p>
</li>
<li><b>Chaque prospect a une seule prochaine action.</b><p>Jamais zéro, jamais deux&nbsp;: <span className="ui">Noter un échange</span> ou <span className="ui">Changer</span> la remplacent. Pour arrêter le suivi, il faut clôturer le prospect.</p>
</li>
</ul>
</section>
<section className="part" id="journee">
<header>
<h2>Une journée type</h2>
<p>Une routine simple pour ne rien laisser passer. Pour la rentrée et la fin de mois, voir <a href="#q14">Q14</a>.</p>
</header>
<figure className="fig">
<Image src="/helpdesk/s04-tasks.jpg" width={1700} height={1075} alt="Page Tâches avec le filtre Moi plus non attribué, les onglets En retard, Aujourd’hui, Demain, À venir, En attente, un appel et un rendez-vous au centre" unoptimized tabIndex={0} role="button" /><figcaption>La page <span className="menu">Tâches</span>&nbsp;: votre point de départ chaque matin. Une ligne par contact, avec sa prochaine action&nbsp;: une mère et ses deux enfants tiennent sur une seule ligne. <i>Capture de la version précédente&nbsp;: les deux listes «&nbsp;Responsable&nbsp;» sont remplacées par trois onglets.</i></figcaption>
<ol className="legend">
<li>Trois onglets&nbsp;: <span className="ui">Mes prospects</span> (vos suivis, ouvert par défaut), <span className="ui">À prendre</span> (ce que personne n’a pris, avec un compteur) et <span className="ui">Toute l’équipe</span> (avec le choix d’une personne).</li>
<li>Les échéances&nbsp;: <b>En retard</b>, <b>Aujourd’hui</b>, <b>Demain</b>, <b>À venir</b> et <b>En attente</b>, avec le nombre de prospects dans chaque onglet.</li>
<li><span className="ui">Pas de réponse</span>&nbsp;: un seul clic enregistre l’appel sans réponse.</li>
<li>Un rendez-vous au centre&nbsp;: ses quatre résultats s’activent à l’heure du rendez-vous.</li>
</ol>
</figure>
<div className="cols">
<div className="card">
<h4>Le matin</h4>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Tâches</span>. Traitez d’abord <b>En retard</b>, puis <b>Aujourd’hui</b>.</p>
</li>
<li><p>L’onglet <span className="ui">Mes prospects</span> montre vos suivis. Regardez aussi <span className="ui">À prendre</span>&nbsp;: les prospects que personne n’a encore pris (par exemple une demande de formulaire). Touchez <span className="ui">Je m’en occupe</span> avant d’appeler&nbsp;: le prospect devient le vôtre et passe dans <span className="ui">Mes prospects</span>.</p>
</li>
<li><p>Commencez par l’onglet <b>En retard</b>, dans <span className="ui">Mes prospects</span> puis dans <span className="ui">À prendre</span>&nbsp;: ce sont les prospects qui risquent d’être oubliés.</p>
</li>
<li><p>Ouvrez <span className="menu">Admissions</span> › <span className="menu">Calendrier</span> en vue <span className="ui">Jour</span>&nbsp;: les rendez-vous au centre du jour, avec ou sans test de niveau.</p>
</li>
<li><p>En bas de <span className="menu">Tâches</span>, la section <b>À vérifier</b> apparaît s’il y a des demandes ambiguës à examiner (<a href="#c1">scénario C1</a>).</p>
</li>
</ol>
</div>
<div className="card">
<h4>Pendant la journée</h4>
<ul className="tight">
<li>Notez chaque échange juste après&nbsp;: <span className="ui">Pas de réponse</span> en un clic, sinon <span className="ui">Noter un échange</span> (<a href="#c2">C2</a>, <a href="#c3">C3</a>).</li>
<li>À l’heure d’un rendez-vous, notez s’il est venu (<a href="#c4">C4</a>).</li>
<li>Une personne se présente&nbsp;: <a href="#q3">scénario Q3</a>.</li>
<li>Chaque paiement donne un reçu à imprimer.</li>
<li>Chaque nouvelle inscription payée attend un groupe&nbsp;: <a href="#q9">scénario Q9</a>.</li>
<li>Une famille veut un reçu, un solde ou un horaire&nbsp;: <a href="#q6">Q6</a>, <a href="#q5">Q5</a>, <a href="#q13">Q13</a>.</li>
</ul>
</div>
<div className="card">
<h4>Avant de partir</h4>
<ul className="tight">
<li><b>En retard</b> est à 0, ou chaque action a été notée ou changée (<a href="#c5">C5</a>).</li>
<li>Les rendez-vous du jour ont leur résultat.</li>
<li>Dans <span className="menu">Liste des apprenants</span>, le filtre <span className="ui">Groupe à affecter</span> ne renvoie plus personne.</li>
<li>Les présences des groupes du jour sont enregistrées.</li>
</ul>
</div>
</div>
</section>
<section className="part" id="crm">
<header>
<h2>Partie 1 · Prospects (CRM)</h2>
<p>Un prospect est une personne qui n’est pas encore inscrite. Vous la suivez, étape par étape, jusqu’à son inscription payée&nbsp;: C1 à C7 suivent cette vie. Une fois le paiement enregistré, tout continue dans la <a href="#quotidien">partie 2</a>.</p>
</header>
<div className="callout info">
<strong>Une seule prochaine action par prospect</strong><p>Un prospect en cours a toujours <b>une</b> prochaine action, jamais deux&nbsp;: un appel, un rendez-vous au centre, un rappel, une chose à faire par nous, ou l’attente de sa réponse. Elle s’affiche dans l’encadré <b>Prochaine action</b> de sa fiche, sur sa carte, sur sa ligne de <span className="menu">Tâches</span> et dans le calendrier, toujours la même. Deux boutons suffisent pour la faire avancer&nbsp;: <span className="ui">Noter un échange</span> (il s’est passé quelque chose) et <span className="ui">Changer</span> (ce qui était prévu change).</p>
</div>
<article className="scn" id="c1">
<header className="scn-head">
<p className="kicker">Scénario C1</p>
<h3>Un nouveau prospect arrive</h3>
<p className="when">Une demande est reçue par un formulaire, ou une personne appelle, écrit ou passe sans formulaire.</p>
</header>
<h4>Cas A&nbsp;: la demande vient d’un formulaire (Meta, site web)</h4>
<p>Le prospect apparaît tout seul dans la colonne <span className="st st-new">Nouveau</span>, avec la prochaine action <b>Premier contact</b>. Il arrive dans <span className="ui">À prendre</span>, visible par toute l’équipe (sauf si la direction a choisi un responsable par défaut&nbsp;: il porte alors son nom). Touchez <span className="ui">Je m’en occupe</span>, puis appelez-le (<a href="#c2">scénario C2</a>).</p>
<p>Si la plateforme hésite sur l’identité de la personne (même téléphone, plusieurs candidats), la demande n’est pas créée toute seule. Elle attend en bas de la page <span className="menu">Tâches</span>, dans <b>À vérifier</b>&nbsp;:</p>
<ol className="steps">
<li><p>Ouvrez la demande et lisez les informations. Vérifiez avec la personne si besoin.</p>
</li>
<li><p>Choisissez dans <span className="ui">Après vérification avec le contact</span>&nbsp;: <span className="ui">Créer un nouveau contact et prospect</span>, <span className="ui">Rattacher à…</span> un prospect existant, <span className="ui">Nouveau prospect pour…</span> ou <span className="ui">Écarter cette demande invalide</span>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Confirmer la décision</span>. Écarter une demande ne peut pas être annulé.</p>
</li>
</ol>
<h4>Cas B&nbsp;: vous ajoutez le prospect vous-même</h4>
<ol className="steps">
<li><p><b>Cherchez d’abord.</b> Cliquez sur <span className="ui">Rechercher une personne</span> en haut du menu (l’icône loupe sur téléphone) et tapez le nom, l’email ou le téléphone, dans n’importe quel format (06…, +212…, 00212…, avec ou sans espaces). Les prospects et les apprenants s’affichent, y compris clôturés et archivés. Ouvrir un résultat ne crée rien.</p>
</li>
<li><p>S’il n’existe pas, cliquez sur <span className="ui">Ajouter un prospect</span> et remplissez le formulaire.</p>
</li>
<li><p>Avec l’origine <b>Téléphone</b>, <b>Visite au centre</b> ou <b>WhatsApp</b>, vous êtes en train de parler avec le contact&nbsp;: la section <b>Premier échange</b> demande ce qui a été convenu, avec les mêmes choix que <span className="ui">Noter un échange</span> (<a href="#c3">scénario C3</a>). Pour un rendez-vous ou un rappel convenu, la plateforme propose le premier jour qui a un créneau libre&nbsp;; l’heure, c’est vous qui la choisissez. Si vous n’avez pas encore parlé avec lui, laissez <span className="ui">Pas encore parlé · Premier contact</span>. Pour une <b>Visite au centre</b>, ce choix n’existe pas&nbsp;: le visiteur est devant vous, choisissez ce qui est convenu avec lui.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>. La fiche du nouveau prospect s’ouvre directement, avec sa prochaine action. Le prospect vous est attribué&nbsp;: vous en êtes la responsable.</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/s05-manual.jpg" width={1700} height={1075} alt="Formulaire Ajouter un prospect rempli, origine Visite au centre, avec la section Premier échange" unoptimized tabIndex={0} role="button" /><figcaption>Le formulaire <span className="ui">Ajouter un prospect</span>, pour une personne venue au centre.</figcaption>
<ol className="legend">
<li><span className="ui">Nom du contact</span>&nbsp;: la personne qui appelle ou qui passe (obligatoire).</li>
<li><span className="ui">Téléphone</span>&nbsp;: la plateforme le met au format international (+212…). Facultatif, mais sans numéro valide vous ne pourrez pas appeler depuis la fiche.</li>
<li><span className="ui">Nom de l’apprenant</span> et <span className="ui">Âge</span> (facultatif). Laissé vide, la case <span className="ui">C’est la même personne</span> est cochée&nbsp;: un adulte qui s’inscrit pour lui-même est le contact et l’apprenant.</li>
<li><span className="ui">Canal</span>&nbsp;: Téléphone, Visite au centre, WhatsApp ou Autre (comment ce premier échange a eu lieu).</li>
<li><span className="ui">Programme</span> (facultatif)&nbsp;: choisi dans la liste du catalogue, ou «&nbsp;À préciser&nbsp;». Une précision libre reste possible.</li>
<li><span className="ui">Origine</span> (facultatif)&nbsp;: comment la personne a connu le centre (Instagram, Facebook, Site web, Google, Recommandation, Passage devant le centre, Appel entrant, Ancien élève, Autre). Pour «&nbsp;Recommandation&nbsp;», indiquez qui a recommandé le centre dans <span className="ui">Recommandé par</span>.</li>
<li><b>Premier échange</b>&nbsp;: ce qui a été convenu, par exemple «&nbsp;En attente du prospect&nbsp;» pour quelqu’un qui reviendra.</li>
</ol>
</figure>
<p>Exemple&nbsp;: une mère passe au centre et «&nbsp;reviendra après la paie&nbsp;». Canal <b>Visite au centre</b>, Premier échange <span className="ui">En attente du prospect</span>, sans date&nbsp;: le prospect passe <span className="st st-eng">En discussion</span>, et la plateforme prévoit une relance dans 5 jours. Aucun «&nbsp;Premier contact&nbsp;» n’est planifié.</p>
<div className="callout info">
<strong>Doublon possible</strong><p>Si le même téléphone (dans n’importe quel format), ou le même nom avec la même date de naissance, existe déjà chez un prospect ou un apprenant, rien n’est créé&nbsp;: la fenêtre affiche <b>Doublon possible</b>. Pour chaque fiche, répondez <span className="ui">Même famille, autre personne</span> ou <span className="ui">Personne différente</span>, puis cliquez à nouveau sur <span className="ui">Enregistrer</span>. Si c’est la même personne, ouvrez sa fiche au lieu de créer. Un email déjà connu est seulement signalé après la création, dans un encadré jaune (<span className="ui">Ouvrir les prospects existants</span>). Rien n’est jamais fusionné automatiquement.</p>
</div>
<h4>Ajouter un enfant, modifier la fiche</h4>
<ul className="tight">
<li><span className="ui">Autres actions</span> › <span className="ui">Ajouter un enfant</span> (sur la fiche d’un prospect)&nbsp;: un deuxième apprenant pour le même contact, avec le même téléphone et sa propre prochaine action. Pas de doublon signalé.</li>
<li><span className="ui">Autres actions</span> › <span className="ui">Modifier la fiche</span>&nbsp;: nom du contact, téléphone, WhatsApp, email, nom et âge de l’apprenant. La modification apparaît dans l’historique («&nbsp;Fiche modifiée&nbsp;», numéros masqués).</li>
<li>Les autres apprenants du même contact s’affichent sur la fiche&nbsp;; un clic ouvre leur fiche.</li>
<li>Deux fiches pour la même personne&nbsp;? La direction peut les <span className="ui">Fusionner</span>&nbsp;: l’historique des deux reste lisible sur la fiche conservée.</li>
</ul>
<h4>Changer le responsable d’un prospect</h4>
<figure className="fig narrow">
<Image src="/helpdesk/s05b-assign.jpg" width={1700} height={1075} alt="Fiche d’un prospect avec le menu Autres actions ouvert sur Attribuer un responsable (capture de la version précédente)" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>La fiche indique le responsable du prospect. Si personne ne l’a pris, elle indique «&nbsp;À prendre&nbsp;» avec le bouton <span className="ui">Je m’en occupe</span>.</li>
<li><span className="ui">Autres actions</span> › <span className="ui">Changer de responsable</span> (le prospect, «&nbsp;Moi&nbsp;» en tête de liste) ou <span className="ui">Confier cette action à…</span> (seulement l’action). Dans la capture, ces deux entrées portent leur ancien nom.</li>
</ol>
</figure>
<p>Prenez un prospect «&nbsp;À prendre&nbsp;» dès que vous vous en occupez, avec <span className="ui">Je m’en occupe</span>&nbsp;: il passe dans <span className="ui">Mes prospects</span>, et vos collègues voient votre nom sur sa carte. Si une collègue l’a pris juste avant vous, la plateforme vous le dit («&nbsp;Déjà pris ou modifié&nbsp;») et met la liste à jour&nbsp;: rien n’est enregistré deux fois.</p>
</article>
<article className="scn" id="c2">
<header className="scn-head">
<p className="kicker">Scénario C2</p>
<h3>J’appelle un prospect</h3>
<p className="when">La prochaine action est <b>Premier contact</b>, <b>Appel de suivi</b> ou <b>Rappel convenu</b>, ou vous appelez pour une autre raison.</p>
</header>
<figure className="fig narrow">
<Image src="/helpdesk/s02-drawer.jpg" width={1700} height={1075} alt="Fiche d’un prospect avec l’encadré Prochaine action, les résultats d’appel, Noter un échange, Changer et Autres actions" unoptimized tabIndex={0} role="button" /><figcaption>La fiche du prospect s’ouvre sur le côté en cliquant sur son nom.</figcaption>
<ol className="legend">
<li><b>Prochaine action</b>&nbsp;: ce qui est prévu, quand, et qui s’en occupe. «&nbsp;En retard&nbsp;» s’affiche si l’heure est passée.</li>
<li><b>Appel</b>&nbsp;: <span className="ui">Pas de réponse</span> s’enregistre en un clic&nbsp;; les autres résultats ouvrent <span className="ui">Noter un échange</span>.</li>
<li><span className="ui">Noter un échange</span> (il s’est passé quelque chose) et <span className="ui">Changer</span> (ce qui était prévu change).</li>
<li><span className="ui">Autres actions</span>&nbsp;: clôturer, attribuer un responsable, réattribuer l’action.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Ouvrez la fiche (clic sur le nom dans <span className="menu">Tâches</span>, sur une carte ou dans la liste). Pour voir le numéro, cliquez sur <span className="ui">Noter un échange</span>&nbsp;: <span className="ui">Copier le numéro</span>, puis passez l’appel avec votre téléphone ou votre standard. Sur un téléphone tactile, un lien <span className="ui">Appeler</span> apparaît.</p>
</li>
<li><p><b>Personne ne répond&nbsp;?</b> Cliquez sur <span className="ui">Pas de réponse</span>, dans la fiche ou directement sur la ligne de <span className="menu">Tâches</span>. C’est enregistré tout de suite («&nbsp;Pas de réponse enregistré&nbsp;»)&nbsp;: il n’y a rien d’autre à remplir.</p>
</li>
<li><p><b>Autre résultat</b> (<span className="ui">Occupé</span>, <span className="ui">Refusé</span>, <span className="ui">Injoignable</span>, <span className="ui">Mauvais numéro</span>, <span className="ui">On a parlé</span>)&nbsp;? Cliquez dessus&nbsp;: <span className="ui">Noter un échange</span> s’ouvre avec ce résultat déjà choisi. Ajoutez une note si utile, puis <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<div className="callout stop">
<strong>Copier le numéro n’enregistre rien</strong><p>Copier le numéro ou ouvrir WhatsApp ne dit pas à la plateforme que vous avez appelé. Seul un résultat enregistré compte. Il n’y a pas de bouton «&nbsp;Annuler&nbsp;»&nbsp;: si vous vous êtes trompée, notez un nouvel échange avec le bon résultat. L’historique des appels n’est jamais modifié.</p>
</div>
<h4>Que se passe-t-il après chaque résultat&nbsp;?</h4>
<div className="scroll">
<table>
<thead>
<tr>
<th>Résultat</th>
<th>Ce qui se passe</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="ui">Pas de réponse</span><br /><span className="ui">Occupé</span><br /><span className="ui">Refusé</span><br /><span className="ui">Injoignable</span></td>
<td><p>Appel raté. Il compte dans la série de 5 appels. Un nouveau prospect passe en <span className="st st-cont">Contact en cours</span>. Si la prochaine action était un appel, la plateforme la déplace toute seule au prochain créneau d’appel (<b>Appel de suivi</b>). Un rendez-vous, un rappel convenu ou une autre action ne bouge pas.</p>
<p>La fiche affiche par exemple «&nbsp;1 appel infructueux sur 5&nbsp;».</p>
</td>
</tr>
<tr>
<td><span className="ui">Mauvais numéro</span></td>
<td><p>Ne compte pas dans les 5 appels. Par défaut, <span className="ui">Enregistrer</span> clôture le prospect <span className="st st-nq">Non qualifié</span>, motif «&nbsp;Mauvais numéro&nbsp;» (deux clics). Sous <b>Et ensuite&nbsp;?</b>, vous pouvez à la place garder l’action actuelle ou choisir une autre suite&nbsp;: rappel convenu, à faire par nous (retrouver le bon numéro) ou en attente. Vous avez le bon numéro&nbsp;? Saisissez-le dans <span className="ui">Numéro corrigé</span> (tous formats acceptés)&nbsp;: la suite proposée devient «&nbsp;garder l’action actuelle&nbsp;», la fiche prend le nouveau numéro et une nouvelle série d’appels commence.</p>
</td>
</tr>
<tr>
<td><span className="ui">On a parlé</span></td>
<td><p>La personne a répondu. Indiquez ce qui a été convenu&nbsp;: voir le <a href="#c3">scénario C3</a>.</p>
</td>
</tr>
</tbody>
</table>
</div>
<div className="callout info">
<strong>Le délai entre deux appels ratés</strong><p>Après un appel raté, la plateforme attend un délai minimum avant de compter le suivant. La fiche l’indique au-dessus des boutons&nbsp;: «&nbsp;Prochain essai possible à 14:20&nbsp;». Pendant ce délai, <span className="ui">Pas de réponse</span> ouvre la fenêtre au lieu d’enregistrer&nbsp;: si vous avez vraiment rappelé, cochez <span className="ui">Tentative réelle (hors délai)</span>, puis <span className="ui">Enregistrer</span>.</p>
</div>
<div className="callout info">
<strong>Le cycle de 5 appels</strong><p>La règle&nbsp;: deux appels le premier jour, un le deuxième, un le quatrième, un le sixième. La plateforme planifie ces appels à votre place, aux heures d’appel du centre.</p>
<p>Après le 5ᵉ appel raté, la plateforme n’en planifie plus&nbsp;: la fiche affiche «&nbsp;5 appels infructueux · séquence automatique terminée&nbsp;», la prochaine action devient <b>En attente du prospect</b>, sans date de relance, et le bouton <span className="ui">Clôturer&nbsp;: injoignable</span> apparaît. <b>Le prospect n’est pas clôturé</b>&nbsp;: à vous de décider. Vous pouvez prévoir un autre appel avec <span className="ui">Changer</span> (<a href="#c5">C5</a>) ou clôturer (<a href="#c7">C7</a>).</p>
</div>
<h4>Appeler depuis le tableau ou la liste</h4>
<p>Dans <span className="menu">Opportunités</span>, chaque carte montre la prochaine action. Déposer une carte sur une autre colonne n’enregistre rien&nbsp;: cela ouvre seulement la bonne fenêtre. L’étape change uniquement quand vous enregistrez un échange, et c’est la plateforme qui la calcule.</p>
</article>
<article className="scn" id="c3">
<header className="scn-head">
<p className="kicker">Scénario C3</p>
<h3>On a parlé&nbsp;: noter un échange</h3>
<p className="when">Vous avez eu une vraie conversation, par téléphone, par WhatsApp ou au centre.</p>
</header>
<figure className="fig narrow">
<Image src="/helpdesk/s03-call.jpg" width={1700} height={1075} alt="Fenêtre Noter un échange : Téléphone, On a parlé, Rendez-vous au centre avec date, heure et test de niveau" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>Le canal&nbsp;: <span className="ui">Téléphone</span>, <span className="ui">WhatsApp</span>, <span className="ui">Au centre</span> ou <span className="ui">Autre</span>.</li>
<li><span className="ui">Résultat</span>&nbsp;: <span className="ui">On a parlé</span> (sur WhatsApp&nbsp;: <span className="ui">On a échangé</span>).</li>
<li><b>Ce qui a été convenu</b>&nbsp;: la prochaine action, une seule.</li>
<li><span className="ui">Heure</span>&nbsp;: seuls les créneaux des horaires du centre sont proposés.</li>
<li><span className="ui">Enregistrer</span>&nbsp;: seul ce clic sauvegarde.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Dans la fiche ou sur la ligne de <span className="menu">Tâches</span>, cliquez sur <span className="ui">Noter un échange</span>. La fenêtre rappelle l’action actuelle.</p>
</li>
<li><p>Choisissez le canal, puis le résultat <span className="ui">On a parlé</span>.</p>
</li>
<li><p>Sous <b>Ce qui a été convenu</b>, choisissez la suite (tableau ci-dessous) et remplissez ce qu’elle demande. Une note est facultative.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>. L’étape est calculée par la plateforme.</p>
</li>
</ol>
<div className="scroll">
<table>
<thead>
<tr>
<th>Ce qui a été convenu</th>
<th>Étape</th>
<th>Prochaine action</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="ui">Rendez-vous au centre</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td>Date et heure convenues, dans les horaires d’ouverture. Cochez <span className="ui">Avec test de niveau</span> si le test a lieu pendant le rendez-vous&nbsp;: il est réservé en même temps. <a href="#c4">Scénario C4</a>.</td>
</tr>
<tr>
<td><span className="ui">Rappeler à l’heure convenue</span></td>
<td><span className="st st-eng">En discussion</span></td>
<td>Une heure exacte promise au contact, dans les horaires d’appel. Elle ne sera jamais déplacée par la plateforme.</td>
</tr>
<tr>
<td><span className="ui">À faire de notre côté (prix, groupe…)</span></td>
<td><span className="st st-eng">En discussion</span></td>
<td>Envoyer le prix, confirmer un groupe… Choisissez <span className="ui">Quand</span>&nbsp;: demain, dans 2 jours, dans une semaine ou une date.</td>
</tr>
<tr>
<td><span className="ui">En attente du prospect</span></td>
<td><span className="st st-eng">En discussion</span></td>
<td>Le contact doit revenir vers nous («&nbsp;je réfléchis&nbsp;», «&nbsp;après la paie&nbsp;»). Relance dans 5 jours par défaut, ou à la date choisie, ou <span className="ui">Sans date de relance</span>.</td>
</tr>
<tr>
<td><span className="ui">Inscrire maintenant</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td><b>Finaliser l’inscription</b>, demain. <a href="#c6">Scénario C6</a>.</td>
</tr>
<tr>
<td><span className="ui">Clôturer</span></td>
<td><span className="st st-lost">Perdu</span> ou <span className="st st-nq">Non qualifié</span>, selon le motif</td>
<td>Aucune. Choisissez un <span className="ui">Motif</span>&nbsp;: le prospect est clôturé tout de suite (<a href="#c7">C7</a>).</td>
</tr>
<tr>
<td><span className="ui">Garder l’action actuelle</span></td>
<td><span className="st st-eng">En discussion</span></td>
<td>Rien ne change&nbsp;: l’échange est seulement noté dans l’historique.</td>
</tr>
</tbody>
</table>
</div>
<ul className="tight">
<li>Un prospect déjà <span className="st st-qual">Qualifié</span> le reste&nbsp;: une conversation ne le fait jamais reculer.</li>
<li>Quand une action est déjà prévue, la fenêtre écrit ce que votre choix va faire&nbsp;: «&nbsp;Remplace&nbsp;: …&nbsp;» ou «&nbsp;Annule&nbsp;: …&nbsp;». Pour remplacer un rendez-vous, cochez <span className="ui">Remplace le rendez-vous</span>. Pour abandonner «&nbsp;Finaliser l’inscription&nbsp;», la fenêtre demande pourquoi.</li>
<li>Une vraie conversation remet à zéro le compteur d’appels ratés.</li>
</ul>
<div className="callout info">
<strong>Les heures proposées</strong><p>Les listes <span className="ui">Heure</span> ne proposent que les créneaux du centre&nbsp;: horaires d’appel pour un rappel, horaires d’ouverture pour un rendez-vous, sans la pause de midi ni les jours de fermeture. Changer la date garde l’heure choisie si ce créneau existe le nouveau jour. «&nbsp;Aucun créneau ce jour-là&nbsp;» signifie que le centre est fermé ou que la journée est passée. Les horaires sont fixés par la direction. Quand ils changent, les heures déjà convenues sont gardées&nbsp;; celles qui sortent des nouveaux horaires sont listées sur <span className="menu">Tâches</span> («&nbsp;Hors des nouveaux horaires&nbsp;»).</p>
</div>
<div className="callout warn">
<strong>Heure convenue ou rappel plus tard&nbsp;?</strong><p><b>Rappeler à l’heure convenue</b>&nbsp;: vous avez promis une heure au contact&nbsp;; il attend votre appel à cette heure. <b>Rappeler plus tard, sans heure promise</b> (dans <span className="ui">Changer</span>)&nbsp;: un pense-bête pour vous, aucune heure n’a été promise&nbsp;; la plateforme le place au prochain créneau. <b>À faire de notre côté</b>&nbsp;: c’est à nous d’agir (envoyer le prix, confirmer un groupe), le contact n’attend pas d’appel.</p>
</div>
<div className="callout info">
<strong>WhatsApp «&nbsp;Message envoyé&nbsp;» et «&nbsp;Simple note&nbsp;»</strong><p>Sur le canal <span className="ui">WhatsApp</span>, <span className="ui">Message envoyé</span> ajoute seulement une ligne à l’historique&nbsp;: il ne change ni l’étape ni la prochaine action. Sur le canal <span className="ui">Autre</span>, <span className="ui">Simple note</span> fait de même pour une information utile à l’équipe.</p>
</div>
<div className="callout warn">
<strong>«&nbsp;Ce prospect a été modifié, rechargez.&nbsp;»</strong><p>Une collègue a enregistré quelque chose sur ce prospect pendant que vous remplissiez la fenêtre. Votre saisie est gardée et <span className="ui">Enregistrer</span> est désactivé. Cliquez sur <span className="ui">Recharger</span>&nbsp;: la fenêtre affiche la nouvelle action actuelle. Vérifiez que votre échange a toujours du sens, puis enregistrez.</p>
</div>
</article>
<article className="scn" id="c4">
<header className="scn-head">
<p className="kicker">Scénario C4</p>
<h3>Rendez-vous au centre et test de niveau</h3>
<p className="when">Le contact veut venir au centre, pour une visite, un test de niveau, ou les deux.</p>
</header>
<ol className="steps">
<li><p><span className="ui">Noter un échange</span> › <span className="ui">On a parlé</span> › <span className="ui">Rendez-vous au centre</span>. Choisissez la date et l’heure convenues. Cochez <span className="ui">Avec test de niveau</span> si l’apprenant passe le test pendant ce rendez-vous.</p>
</li>
<li><p>Le prospect passe <span className="st st-qual">Qualifié</span>. Sa prochaine action devient par exemple «&nbsp;Rendez-vous au centre 23/11 16:00 (avec test)&nbsp;». Le test est créé «&nbsp;Planifié&nbsp;» à la même heure. Le rendez-vous apparaît une seule fois dans <span className="menu">Tâches</span> et dans <span className="menu">Calendrier</span>.</p>
</li>
<li><p>À l’heure du rendez-vous, notez son résultat avec l’un des quatre boutons, depuis la fiche, la ligne de <span className="menu">Tâches</span> ou le calendrier. Avant l’heure, les boutons sont grisés («&nbsp;à partir de 16:00&nbsp;»).</p>
</li>
</ol>
<div className="scroll">
<table>
<thead>
<tr>
<th>Résultat du rendez-vous</th>
<th>Ce qui se passe</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="ui">Venu · s’inscrit</span></td>
<td>Prochaine action&nbsp;: <b>Finaliser l’inscription</b>, demain (<a href="#c6">C6</a>). Le test passe «&nbsp;Passé&nbsp;».</td>
</tr>
<tr>
<td><span className="ui">Venu · reviendra</span></td>
<td>Prochaine action&nbsp;: <b>En attente du prospect</b>, relance dans 5 jours. Le test passe «&nbsp;Passé&nbsp;».</td>
</tr>
<tr>
<td><span className="ui">Venu · pas intéressé</span></td>
<td>Choisissez <span className="ui">Pourquoi&nbsp;?</span> (prix, horaires, localisation, autre centre choisi, projet reporté, ou autre raison avec une précision), puis <span className="ui">Clôturer</span>&nbsp;: le prospect est clôturé <span className="st st-lost">Perdu</span> avec ce motif. Le test passe «&nbsp;Passé&nbsp;».</td>
</tr>
<tr>
<td><span className="ui">Absent</span></td>
<td>La plateforme propose un rappel pour l’équipe, demain&nbsp;: cliquez sur <span className="ui">Confirmer le rappel</span>. Le test passe «&nbsp;Absent&nbsp;».</td>
</tr>
</tbody>
</table>
</div>
<p>Pour <b>déplacer</b> le rendez-vous&nbsp;: <span className="ui">Changer</span>. La fenêtre s’ouvre sur le rendez-vous actuel&nbsp;: changez la date (l’heure est gardée si le créneau existe), cochez <span className="ui">Remplace le rendez-vous</span>, puis <span className="ui">Enregistrer</span>. Pour l’<b>annuler</b>, choisissez une autre suite dans <span className="ui">Changer</span> (par exemple <span className="ui">En attente du prospect</span>)&nbsp;: le rendez-vous et son test sont annulés (le test passe «&nbsp;Annulé&nbsp;»). Voir <a href="#c5">C5</a>.</p>
<h4>Réserver un test depuis la fiche</h4>
<p>Pour un prospect «&nbsp;Qualifié&nbsp;» sans test prévu, vous pouvez aussi réserver depuis la section <b>Test de niveau</b> de la fiche, bouton <span className="ui">Réserver un test</span>. Remplissez la fenêtre, puis <span className="ui">Enregistrer</span>&nbsp;: le test et son rendez-vous deviennent la prochaine action du prospect.</p>
<figure className="fig narrow">
<Image src="/helpdesk/s06-booking.jpg" width={1700} height={1075} alt="Fenêtre de réservation d’un test de niveau" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Date</span>&nbsp;: doit être dans le futur.</li>
<li><span className="ui">Heure</span>&nbsp;: obligatoire pour un prospect, dans les horaires d’ouverture.</li>
<li><span className="ui">Examinateur</span>&nbsp;: un simple nom. La plateforme ne vérifie aucune disponibilité.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<h4>Le calendrier</h4>
<figure className="fig">
<Image src="/helpdesk/s07-calendar.jpg" width={1700} height={1075} alt="Calendrier admissions sur une semaine avec des rendez-vous au centre, avec ou sans test de niveau, et leurs boutons de résultat" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Période</span>&nbsp;: <b>Jour</b> ou <b>Semaine</b>. La semaine compte 7 jours à partir de la date de début, pas du lundi.</li>
<li><span className="ui">Rendez-vous</span>&nbsp;: tous, avec test de niveau, ou rendez-vous au centre.</li>
<li><span className="ui">Inclure terminés</span>&nbsp;: sans cette case, seuls les rendez-vous ouverts et les tests «&nbsp;Planifié&nbsp;» sont affichés.</li>
<li>Le résultat du rendez-vous se note aussi depuis le calendrier.</li>
</ol>
</figure>
<p>Cliquer sur le nom d’un prospect ouvre sa fiche. Une ligne sans prospect (test créé à la main) ouvre le formulaire du test.</p>
<h4>Après le test</h4>
<ol className="steps">
<li><p>Ouvrez la fiche du prospect, section <b>Test de niveau</b>, puis <span className="ui">Voir</span>.</p>
</li>
<li><p>Passez le <span className="ui">Statut</span> à <b>Résultat saisi</b> avec le <span className="ui">Score</span> et le <span className="ui">Niveau recommandé</span> (obligatoire).</p>
</li>
<li><p>La prochaine action devient <b>Proposer l’inscription</b>, et la fiche affiche le niveau recommandé. Appelez le contact&nbsp;: aucun email de résultat n’est envoyé depuis votre espace.</p>
</li>
</ol>
<div className="callout warn">
<strong>À retenir</strong><ul className="tight">
<li>«&nbsp;Passé&nbsp;» s’affiche tout seul une fois l’heure du test dépassée&nbsp;: il ne se choisit pas. Pour un test qui n’aura pas lieu, déplacez ou annulez le rendez-vous avec <span className="ui">Changer</span>.</li>
<li>Un test terminé n’inscrit pas le prospect&nbsp;: il reste <span className="st st-qual">Qualifié</span>.</li>
<li><span className="ui">Planifier un test</span> sur la page <span className="menu">Tests de niveau</span> demande d’abord la personne (nom, téléphone ou email). Pour un apprenant, le test est réservé là. Pour un prospect, sa fiche s’ouvre&nbsp;: son test se réserve avec son <span className="ui">Rendez-vous au centre</span>.</li>
</ul>
</div>
</article>
<article className="scn" id="c5">
<header className="scn-head">
<p className="kicker">Scénario C5</p>
<h3>Changer la prochaine action</h3>
<p className="when">Ce qui était prévu change sans nouvel échange&nbsp;: un rendez-vous à déplacer, un rappel à reporter, une action devenue inutile.</p>
</header>
<figure className="fig narrow">
<Image src="/helpdesk/s03b-changer.jpg" width={1700} height={1075} alt="Fenêtre Changer la prochaine action sur un rendez-vous au centre, avec Remplace et la case Remplace le rendez-vous" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><b>Prochaine action</b>&nbsp;: la nouvelle suite. La fenêtre s’ouvre sur l’action actuelle.</li>
<li><span className="ui">Date</span> et <span className="ui">Heure</span>&nbsp;: pour un rendez-vous ou un rappel convenu.</li>
<li>«&nbsp;Remplace&nbsp;: …&nbsp;»&nbsp;: ce qui sera remplacé. Un rendez-vous demande la case <span className="ui">Remplace le rendez-vous</span>.</li>
<li><span className="ui">Garder l’action actuelle</span>&nbsp;: ferme sans rien changer.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Dans la fiche ou sur la ligne de <span className="menu">Tâches</span>, cliquez sur <span className="ui">Changer</span>.</p>
</li>
<li><p>Choisissez la nouvelle prochaine action&nbsp;: <span className="ui">Rendez-vous au centre</span> (pour un prospect <span className="st st-qual">Qualifié</span>, ou pour déplacer un rendez-vous&nbsp;; sinon, notez l’échange avec <span className="ui">On a parlé</span>, qui qualifie le prospect), <span className="ui">Rappeler à l’heure convenue</span>, <span className="ui">À faire de notre côté</span>, <span className="ui">Rappeler plus tard, sans heure promise</span>, <span className="ui">En attente du prospect</span>, ou <span className="ui">Clôturer</span> avec un motif.</p>
</li>
<li><p>Pour simplement déplacer un rendez-vous ou un rappel convenu, gardez le même choix et changez la date&nbsp;: l’heure convenue est gardée.</p>
</li>
<li><p>Lisez «&nbsp;Remplace&nbsp;: …&nbsp;», cochez ce qui est demandé, puis <span className="ui">Enregistrer</span> («&nbsp;Prochaine action enregistrée&nbsp;»).</p>
</li>
</ol>
<div className="callout warn">
<strong>Jamais deux actions</strong><p>Le nouveau choix <b>remplace</b> l’ancien&nbsp;: un prospect en cours n’a jamais deux actions à la fois. Un rendez-vous remplacé est annulé avec son test. Pour arrêter le suivi, il faut clôturer le prospect (<a href="#c7">C7</a>).</p>
</div>
<p>Pour confier seulement l’action à une collègue, sans changer le responsable du prospect&nbsp;: <span className="ui">Autres actions</span> › <span className="ui">Confier cette action à…</span>.</p>
</article>
<article className="scn" id="c6">
<header className="scn-head">
<p className="kicker">Scénario C6</p>
<h3>Inscrire un prospect&nbsp;: inscription et paiement en une fois</h3>
<p className="when">Le prospect est <span className="st st-qual">Qualifié</span> et veut s’inscrire (prochaine action <b>Finaliser l’inscription</b>, <b>Encaisser l’acompte</b> ou <b>Proposer l’inscription</b>). L’inscription et le paiement se font ensemble, dans la même fenêtre&nbsp;: une inscription n’existe qu’une fois payée.</p>
</header>
<ol className="flow">
<li><b>Prospect Qualifié</b><small>le projet est qualifié</small></li>
<li><b>Inscrire et encaisser</b><small>apprenant, inscription, paiement&nbsp;: le prospect passe aussitôt en «&nbsp;Inscription confirmée&nbsp;»</small></li>
<li><b>Groupe affecté</b><small>dans la même fenêtre, ou plus tard avec «&nbsp;Groupe à affecter&nbsp;»</small></li>
</ol>
<ol className="steps">
<li><p>Dans la fiche, section <b>Inscription</b>, cliquez sur <span className="ui">Inscrire et encaisser</span>. Le bouton n’existe que pour un prospect <span className="st st-qual">Qualifié</span> sans inscription.</p>
<p><b>Visite qui paie tout de suite.</b> Dans <span className="ui">Ajouter un prospect</span>, choisissez l’origine «&nbsp;Visite au centre&nbsp;» et la prochaine action <span className="ui">Inscrire maintenant</span>&nbsp;: après <span className="ui">Enregistrer</span>, la fenêtre <span className="ui">Inscrire et encaisser</span> s’ouvre directement.</p>
</li>
<li><p><b>Étape 1/3, Apprenant.</b> Saisissez le <span className="ui">Nom de l’apprenant</span> et, si vous la connaissez, la date de naissance (pas dans le futur). La plateforme cherche les apprenants déjà connus&nbsp;: <span className="ui">Utiliser cet apprenant</span> s’il s’agit de lui, sinon <span className="ui">Créer un nouvel apprenant</span>. Quand aucun apprenant ne correspond, ce clic passe directement à l’étape 2&nbsp;; sinon cochez «&nbsp;J’ai vérifié les correspondances&nbsp;: il s’agit d’un autre apprenant&nbsp;» puis <span className="ui">Continuer</span>.</p>
</li>
<li><p><b>Étape 2/3, Inscription.</b> Programme, année scolaire, niveau proposé et <span className="ui">Groupe (facultatif)</span> (ou «&nbsp;À affecter plus tard&nbsp;»). Le programme «&nbsp;Autre&nbsp;» n’est pas une inscription&nbsp;: il s’encaisse depuis la fiche apprenant (<a href="#q3">Q3</a>).</p>
<p><b>L’année scolaire suit le groupe.</b> Dès que vous choisissez un groupe, son année scolaire remplit le champ <span className="ui">Année scolaire</span>, qui ne se modifie plus («&nbsp;L’année scolaire suit le groupe choisi.&nbsp;»). Pour une autre année, choisissez un groupe de cette année. Avec «&nbsp;À affecter plus tard&nbsp;», vérifiez vous-même l’année (format 2026/2027).</p>
</li>
<li><p><b>Étape 3/3, Paiement.</b> Saisissez le <span className="ui">Prix brut convenu</span>, la <span className="ui">Remise</span> éventuelle avec son motif, le <span className="ui">Montant payé aujourd’hui</span>, la date et le mode de paiement (les règles sont dans le <a href="#regles-paiement">scénario Q3</a>), puis <span className="ui">Inscrire et encaisser</span>. Toutes les erreurs du paiement s’affichent en même temps, avant l’enregistrement.</p>
<p><b>L’apprenant a déjà un engagement sans inscription</b> pour ce programme et cette année&nbsp;? La fenêtre l’affiche en haut, sélectionné, avec <span className="ui">Encaisser sur cet engagement</span>&nbsp;: saisissez seulement le montant payé. Aucun deuxième engagement n’est créé. <span className="ui">Nouvelle session</span> sert uniquement à une vraie deuxième inscription.</p>
<p><b>Le prospect réserve mais ne paie pas aujourd’hui&nbsp;?</b> Choisissez <span className="ui">Réserver sans paiement</span>, saisissez le prix et l’<span className="ui">Échéance de l’acompte</span>. L’engagement est enregistré sans reçu, sans inscription et sans place dans un groupe&nbsp;; le prospect reste <span className="st st-qual">Qualifié</span> et sa prochaine action devient <b>Encaisser l’acompte</b>, à la date d’échéance. Le jour du paiement, rouvrez le prospect › <span className="ui">Inscrire et encaisser</span>&nbsp;: l’engagement réservé est déjà sélectionné.</p>
</li>
<li><p>La fenêtre affiche «&nbsp;Inscription confirmée · reçu&nbsp;…&nbsp;» (avec le numéro du reçu), puis la ligne «&nbsp;Groupe&nbsp;: …&nbsp;» (avec le nom du groupe choisi) ou «&nbsp;Groupe à affecter&nbsp;» (sans groupe), et le bouton <span className="ui">Ouvrir le reçu</span>. Avec une remise de 100&nbsp;%, le titre est «&nbsp;Inscription confirmée sans paiement (remise 100&nbsp;%)&nbsp;» et aucun reçu n’est émis. Le prospect passe aussitôt en <span className="st st-conv">Inscription confirmée</span> et sa prochaine action est terminée. Sans groupe, terminez plus tard par le <a href="#q9">scénario Q9</a>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s08-enroll.jpg" width={1700} height={1075} alt="Fenêtre Inscrire et encaisser, étape 3 sur 3 : le paiement" unoptimized tabIndex={0} role="button" /><figcaption>Étape 3 sur 3 de la fenêtre <span className="ui">Inscrire et encaisser</span>.</figcaption>
<ol className="legend">
<li>Le rappel en haut&nbsp;: l’apprenant et l’inscription choisis aux étapes 1 et 2.</li>
<li><span className="ui">Prix brut convenu</span>&nbsp;: saisi à chaque nouvel engagement, il n’y a pas de tarif par défaut.</li>
<li><span className="ui">Montant payé aujourd’hui</span>&nbsp;: tout montant supérieur à zéro confirme l’inscription&nbsp;; le reste à payer est suivi comme d’habitude.</li>
<li><span className="ui">Envoyer aussi le reçu par e-mail</span>&nbsp;: facultatif.</li>
</ol>
</figure>
<p>Si l’enregistrement répond «&nbsp;L’année scolaire de l’inscription doit être celle du groupe. Choisissez un groupe de cette année ou une autre année.&nbsp;», revenez à l’étape 2 et choisissez un groupe de l’année voulue. «&nbsp;Ce groupe n’a pas d’année scolaire…&nbsp;»&nbsp;: choisissez un autre groupe ou demandez à la direction de la renseigner.</p>
<p>Si le groupe ne peut pas être affecté (complet entre-temps, par exemple), le paiement reste enregistré et la fenêtre l’indique&nbsp;: «&nbsp;Groupe non affecté&nbsp;: …&nbsp;Apprenant inscrit — groupe à affecter.&nbsp;» Affectez un autre groupe avec le <a href="#q9">scénario Q9</a>.</p>
<div className="callout stop">
<strong>Montant à 0&nbsp;: refusé</strong><p>Sans paiement, la fenêtre répond «&nbsp;L’inscription se confirme à l’encaissement&nbsp;: saisissez un paiement.&nbsp;» et rien n’est créé&nbsp;: ni apprenant, ni inscription, ni conversion. Exceptions&nbsp;: une remise de 100&nbsp;% avec son motif (inscription gratuite, visible par la direction dans <span className="ui">Contrôles</span>), et <span className="ui">Réserver sans paiement</span>, qui n’inscrit pas.</p>
</div>
<div className="callout info">
<strong>Le prospect a déjà payé à l’accueil&nbsp;?</strong><p>À l’étape 2, choisissez son inscription existante («&nbsp;Inscription payée sélectionnée&nbsp;») puis <span className="ui">Rattacher cette inscription payée</span>&nbsp;: l’étape 3 devient une vérification, sans nouveau paiement, et la fenêtre affiche «&nbsp;Inscription payée rattachée&nbsp;». Une inscription non payée ne peut pas être rattachée.</p><p>Si un montant est déjà enregistré sur cette inscription («&nbsp;Un montant est déjà enregistré sur cette inscription · reste … MAD&nbsp;»), la fenêtre ne crée jamais un deuxième montant&nbsp;: <span className="ui">Encaisser sur ce montant</span> ouvre le formulaire de reçu sur ce solde. Une fois payée, revenez rattacher l’inscription.</p>
</div>
</article>
<article className="scn" id="c7">
<header className="scn-head">
<p className="kicker">Scénario C7</p>
<h3>Clôturer ou rouvrir un prospect</h3>
<p className="when">Le suivi est terminé sans inscription, ou un prospect clôturé redevient actif.</p>
</header>
<ol className="steps">
<li><p>Dans la fiche, cliquez sur <span className="ui">Autres actions</span>, puis <span className="ui">Clôturer le prospect</span>. Après une conversation, vous pouvez aussi choisir <span className="ui">Clôturer</span> directement dans <span className="ui">Noter un échange</span> ou <span className="ui">Changer</span>.</p>
</li>
<li><p>Choisissez le <span className="ui">Motif</span> dans une seule liste. Pour «&nbsp;Pas intéressé&nbsp;», choisissez aussi <span className="ui">Pourquoi&nbsp;?</span>. Ajoutez une précision (obligatoire pour «&nbsp;Autre&nbsp;» et «&nbsp;Autre raison&nbsp;»), puis <span className="ui">Enregistrer</span>. Le statut (Perdu ou Non qualifié) découle du motif.</p>
</li>
</ol>
<div className="scroll">
<table>
<thead>
<tr>
<th>Clôture</th>
<th>Motifs proposés</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="st st-lost">Perdu</span></td>
<td>Pas intéressé (Prix, Horaires, Localisation, Autre centre choisi, Projet reporté, ou autre raison), Injoignable, Doublon, Autre.<br />«&nbsp;Injoignable&nbsp;» n’est possible qu’après 5 appels ratés&nbsp;: la fiche affiche alors <span className="ui">Clôturer&nbsp;: injoignable</span>.</td>
</tr>
<tr>
<td><span className="st st-nq">Non qualifié</span></td>
<td>Mauvais numéro, Âge ou programme non adapté, Invalide / indésirable, Hors périmètre.</td>
</tr>
</tbody>
</table>
</div>
<ul className="tight">
<li>Une clôture annule la prochaine action du prospect et son test encore «&nbsp;Planifié&nbsp;» (le test passe «&nbsp;Annulé&nbsp;»). Un prospect clôturé n’a plus aucune action.</li>
<li>Un test gardé au début d’une inscription reste attaché à <b>Finaliser l’inscription</b>. Remplacer cette action par un appel ou un message (<span className="ui">Changer</span>) annule le test&nbsp;; la déplacer à une autre date le garde.</li>
<li>Les prospects clôturés ne sont plus dans le tableau. Ouvrez la vue <span className="ui">Clôturés</span> ou le lien «&nbsp;0 clôturés&nbsp;» en haut de page (affichage en liste).</li>
<li><b>Rouvrir</b>&nbsp;: fiche › <span className="ui">Rouvrir le prospect</span>. Un motif est demandé, et une prochaine action est proposée (modifiable). La réouverture ne propose pas de rendez-vous au centre&nbsp;: pour en réserver un (avec ou sans test), notez l’échange avec <span className="ui">Noter un échange</span> › «&nbsp;On a parlé&nbsp;». Le prospect revient en «&nbsp;En discussion&nbsp;» s’il y a déjà eu une conversation, sinon en «&nbsp;Contact en cours&nbsp;», et le compteur d’appels repart à zéro.</li>
<li>Un prospect <span className="st st-conv">Inscription confirmée</span> ne peut plus être rouvert ni modifié depuis cet écran.</li>
</ul>
</article>
<article className="scn" id="c8">
<header className="scn-head">
<p className="kicker">Scénario C8</p>
<h3>Une mère, ses deux enfants et un cousin&nbsp;: du test à l’inscription</h3>
<p className="when">Une mère se présente avec ses deux enfants et un cousin. Les trois passent un test de niveau. Une semaine plus tard, ils reviennent s’inscrire.</p>
</header>
<div className="callout info">
<strong>La règle à retenir</strong><p>Un apprenant = une fiche, un test, une inscription et un reçu. Pour trois enfants, vous faites donc trois fois <span className="ui">Inscrire et encaisser</span> et vous remettez trois reçus. Un seul paiement ne peut pas couvrir plusieurs enfants&nbsp;: saisissez pour chacun le montant qui le concerne.</p>
</div>
<h4>Le jour de la première visite</h4>
<ol className="steps">
<li><p><span className="ui">Rechercher une personne</span>&nbsp;: vérifiez d’abord que la mère n’est pas déjà enregistrée (son nom ou son téléphone).</p>
</li>
<li><p><span className="ui">Ajouter un prospect</span>, pour le premier enfant&nbsp;: <span className="ui">Nom du contact</span> (la mère), <span className="ui">Téléphone</span>, <span className="ui">Nom de l’apprenant</span> (l’enfant). Dans <span className="ui">Canal</span>, choisissez <span className="ui">Visite au centre</span>.</p>
</li>
<li><p>Dans <span className="ui">Premier échange</span>, choisissez <span className="ui">Rendez-vous au centre</span>, la date et l’heure du test, et cochez <span className="ui">Avec test de niveau</span>. Puis <span className="ui">Enregistrer</span>&nbsp;: le prospect est <span className="st st-qual">Qualifié</span> et son test est «&nbsp;Planifié&nbsp;».</p>
</li>
<li><p>Pour le deuxième enfant, restez sur la fiche du premier&nbsp;: <span className="ui">Autres actions</span> › <span className="ui">Ajouter un enfant</span>. Le contact et le téléphone sont repris&nbsp;; saisissez seulement son nom, le canal et le même rendez-vous avec test.</p>
</li>
<li><p>Pour le cousin, deux cas&nbsp;:</p>
<ul className="tight">
<li>la mère répond pour lui (c’est elle qu’on appelle et qui paie)&nbsp;: <span className="ui">Autres actions</span> › <span className="ui">Ajouter un enfant</span>, comme pour le deuxième enfant&nbsp;;</li>
<li>ses propres parents répondent pour lui&nbsp;: <span className="ui">Ajouter un prospect</span> avec leur nom et leur téléphone. Si la plateforme signale «&nbsp;Cette personne existe peut-être déjà&nbsp;», répondez <span className="ui">Même famille, autre personne</span>, puis <span className="ui">Enregistrer</span> de nouveau.</li>
</ul>
</li>
<li><p>Les trois tests peuvent être à la même heure. Après le test, ouvrez chaque fiche&nbsp;: notez le résultat du rendez-vous avec <span className="ui">Venu · reviendra</span>, puis, section <b>Test de niveau</b> › <span className="ui">Voir</span>, passez le <span className="ui">Statut</span> à <span className="ui">Résultat saisi</span> avec le <span className="ui">Score</span> et le <span className="ui">Niveau recommandé</span>.</p>
</li>
</ol>
<div className="callout warn">
<strong>Si le test se passe tout de suite</strong><p>La plateforme ne propose que des heures à venir, et elle refuse un résultat avant l’heure du test. Réservez donc le prochain créneau proposé aujourd’hui, faites passer le test, puis saisissez le résultat une fois cette heure passée.</p>
</div>
<h4>En attendant leur retour</h4>
<ul className="tight">
<li>Dans <span className="menu">Tâches</span>, la famille tient sur une seule ligne&nbsp;: celle de la mère, avec ses enfants. Un cousin enregistré avec ses propres parents a sa propre ligne.</li>
<li>Après <span className="ui">Venu · reviendra</span>, la prochaine action est <span className="ui">En attente du prospect</span>, avec une relance dans 5 jours&nbsp;: la fiche n’est jamais «&nbsp;En retard&nbsp;». Le niveau recommandé reste visible dans la section <b>Test de niveau</b> de la fiche.</li>
</ul>
<h4>Une semaine plus tard&nbsp;: l’inscription</h4>
<ol className="steps">
<li><p>Retrouvez la mère avec <span className="ui">Rechercher une personne</span>, ou dans <span className="menu">Tâches</span>, onglet <b>En attente</b>. Ouvrez la fiche du premier enfant.</p>
</li>
<li><p>Section <b>Inscription</b>, cliquez sur <span className="ui">Inscrire et encaisser</span>. Trois étapes&nbsp;: <b>Apprenant</b> (son nom, sa date de naissance si elle est connue), <b>Inscription</b> (programme, année scolaire, niveau proposé déjà rempli d’après le test, groupe si vous le connaissez), <b>Paiement</b> (prix, remise éventuelle avec son motif, par exemple <span className="ui">Fratrie</span>, montant payé aujourd’hui, date et mode de paiement).</p>
</li>
<li><p>Validez&nbsp;: la plateforme affiche «&nbsp;Inscription confirmée · reçu…&nbsp;» avec <span className="ui">Ouvrir le reçu</span>. Le prospect passe en <span className="st st-conv">Inscription confirmée</span> et n’a plus de prochaine action.</p>
</li>
<li><p>Recommencez pour le deuxième enfant, puis pour le cousin&nbsp;: une fiche, une inscription, un reçu chacun. Les autres enfants du même contact sont listés sur la fiche&nbsp;: un clic ouvre la suivante.</p>
</li>
</ol>
<div className="callout warn"><strong>À retenir</strong><ul className="tight">
<li>Un paiement partiel est accepté&nbsp;: le reste dû reste suivi sur la fiche de l’apprenant. Un montant à 0 est refusé, sauf remise de 100&nbsp;% avec son motif.</li>
<li>La remise «&nbsp;Fratrie&nbsp;» n’est pas calculée par la plateforme&nbsp;: vous la saisissez sur l’inscription de chaque enfant concerné, selon la consigne de la direction.</li>
<li>Si la mère paie tout en une fois, répartissez la somme&nbsp;: un montant par enfant, un reçu par enfant.</li>
<li>Le détail de chaque étape&nbsp;: <a href="#c1">C1</a> (nouveau prospect), <a href="#c4">C4</a> (rendez-vous et test), <a href="#c6">C6</a> (inscription).</li>
</ul></div>
</article>
</section>
<section className="part" id="quotidien">
<header>
<h2>Partie 2 · Au quotidien</h2>
<p>Les personnes inscrites, ou qui se présentent au guichet&nbsp;: leur dossier, leurs paiements, leur groupe, leurs présences, et les enseignants. Ces scénarios s’utilisent chaque jour, dans n’importe quel ordre.</p>
</header>
<article className="scn" id="q1">
<header className="scn-head">
<p className="kicker">Scénario Q1</p>
<h3>Retrouver un apprenant</h3>
<p className="when">Quelqu’un appelle ou se présente pour un apprenant déjà connu, ou vous voulez vérifier qu’il n’existe pas avant d’en créer un.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Liste des apprenants</span> et choisissez la vue <span className="ui">Cartes</span>.</p>
</li>
<li><p>Tapez dans la barre de recherche le <b>nom</b>, l’<b>email</b> ou le <b>numéro de téléphone</b>. La liste se réduit à mesure que vous tapez.</p>
</li>
<li><p>Pour affiner, utilisez <span className="ui">Toutes les sessions</span>, <span className="ui">Tous les niveaux</span>, <span className="ui">Tous les statuts</span> et <span className="ui">Toutes catégories</span>. <span className="ui">Grille</span> et <span className="ui">Liste</span> changent seulement l’affichage.</p>
</li>
<li><p>Cliquez sur la carte de la personne pour ouvrir sa <b>fiche</b> (niveau, solde, paiements, inscriptions, groupe).</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q01-annuaire.jpg" width={1700} height={1075} alt="Apprenants en cartes avec une recherche par numéro de téléphone et la carte d’un apprenant" unoptimized tabIndex={0} role="button" /><figcaption>Les apprenants en cartes, ici avec une recherche par numéro de téléphone.</figcaption>
<ol className="legend">
<li>La recherche accepte le nom, l’email et le <b>téléphone</b>.</li>
<li>La carte indique la catégorie, le groupe, le téléphone et le statut du dossier. Un clic ouvre la fiche.</li>
</ol>
</figure>
<div className="callout info">
<strong>Cartes ou Tableau&nbsp;?</strong><p>Une seule <b>Liste des apprenants</b>, deux vues. Les <b>Cartes</b> pour retrouver quelqu’un d’un coup d’œil, le <b>Tableau</b> pour travailler&nbsp;: paiement, groupe à affecter, filtres. Dans les deux, la recherche trouve le nom, l’email et le téléphone, dans tous les formats. L’ancien lien «&nbsp;Annuaire&nbsp;» ouvre la vue Cartes.</p>
</div>
<p>Les statuts s’affichent en anglais (Enrolled, Prospect…)&nbsp;: la traduction est dans le <a href="#comprendre">glossaire</a>.</p>
</article>
<article className="scn" id="q2">
<header className="scn-head">
<p className="kicker">Scénario Q2</p>
<h3>Créer ou compléter un dossier</h3>
<p className="when">Un nouvel apprenant sans paiement, un dossier incomplet, ou un document à ajouter.</p>
</header>
<h4>Créer un dossier</h4>
<ol className="steps">
<li><p><b>Cherchez d’abord</b> dans la <span className="menu">Liste des apprenants</span> (<a href="#q1">Q1</a>)&nbsp;: ce formulaire ne détecte aucun doublon.</p>
</li>
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Ajouter un apprenant</span>. Seul le <span className="ui">Nom complet</span> est obligatoire&nbsp;; remplissez le reste si vous le savez&nbsp;: <span className="ui">Date de naissance</span>, <span className="ui">Téléphone</span>, <span className="ui">Email apprenant</span>, <span className="ui">Email parent</span>, <span className="ui">Catégorie d’âge</span>, <span className="ui">Session</span>, <span className="ui">Niveau</span>, <span className="ui">Source</span>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>. Le message «&nbsp;Apprenant créé&nbsp;» s’affiche et la fiche s’ouvre. Le dossier n’a <b>ni inscription ni groupe</b>&nbsp;: pour inscrire, cliquez sur <span className="ui">Inscrire et encaisser</span> dans la fiche (<a href="#q7">Q7</a>).</p>
</li>
</ol>
<div className="callout stop">
<strong>Ne cliquez pas deux fois</strong><p>Après une erreur ou une coupure, un nouvel envoi peut créer un second apprenant. Regardez d’abord dans la Liste des apprenants avant de recommencer.</p>
</div>
<h4>Compléter ou corriger un dossier</h4>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant (<a href="#q1">Q1</a>) et cliquez sur <span className="ui">Modifier</span>, en haut à droite.</p>
</li>
<li><p>Corrigez le nom, la date de naissance, le téléphone, la catégorie d’âge ou les notes, puis <span className="ui">Enregistrer</span> («&nbsp;Apprenant mis à jour&nbsp;»). Vous pouvez aussi ajouter une <span className="ui">Photo</span> (JPEG ou PNG).</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q02-modifier-apprenant.jpg" width={1700} height={1075} alt="Formulaire Modifier l’apprenant avec la photo, le nom complet, les emails et le bouton Enregistrer" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Photo</span>&nbsp;: JPEG ou PNG.</li>
<li><span className="ui">Nom complet</span>&nbsp;: le seul champ obligatoire.</li>
<li><span className="ui">Email apprenant</span> et <span className="ui">Email parent</span>&nbsp;: modifiables tant qu’aucun compte famille (actif ou invitation en attente) n’utilise l’ancienne adresse&nbsp;; sinon la plateforme refuse et la direction s’en charge. Chaque changement d’adresse est noté dans l’historique.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<p>La session et le niveau ne se changent pas ici&nbsp;: le formulaire le rappelle. Pour déplacer l’apprenant, voir <a href="#q10">Q10</a>.</p>
<h4>Ajouter un document</h4>
<p>Les documents se déposent sur l’<b>inscription</b>, dans la section <b>Inscriptions et groupes</b> de la fiche&nbsp;: cliquez sur <span className="ui">Ajouter un document</span> sous l’inscription concernée. Formats acceptés&nbsp;: JPEG, PNG ou PDF, 10&nbsp;Mo au plus.</p>
<figure className="fig">
<Image src="/helpdesk/q02b-fiche-inscriptions.jpg" width={1700} height={1475} alt="Fiche d’un apprenant avec la section Inscriptions et groupes, les boutons Inscrire et encaisser, Modifier l’inscription et Ajouter un document" unoptimized tabIndex={0} role="button" /><figcaption>La fiche d’un apprenant, section <b>Inscriptions et groupes</b>.</figcaption>
<ol className="legend">
<li><span className="ui">Inscrire et encaisser</span>&nbsp;: inscrit l’apprenant en encaissant le premier paiement (<a href="#q7">Q7</a>).</li>
<li><span className="ui">Modifier l’inscription</span>&nbsp;: change le groupe ou le niveau de cette inscription (<a href="#q10">Q10</a>).</li>
<li><span className="ui">Ajouter un document</span>&nbsp;: joint un fichier à cette inscription.</li>
</ol>
</figure>
</article>
<article className="scn" id="q3">
<header className="scn-head">
<p className="kicker">Scénario Q3</p>
<h3>Un visiteur se présente au guichet</h3>
<p className="when">Une personne arrive sans avoir été contactée par les formulaires. Pas besoin de créer un faux prospect.</p>
</header>
<div className="scroll">
<table>
<thead>
<tr>
<th>Situation</th>
<th>Que faire</th>
</tr>
</thead>
<tbody>
<tr>
<td>Elle demande des informations, sans s’inscrire aujourd’hui</td>
<td><span className="menu">Opportunités</span> › <span className="ui">Ajouter un prospect</span>, <span className="ui">Origine</span> «&nbsp;Visite au centre&nbsp;». Elle suit ensuite le parcours normal.</td>
</tr>
<tr>
<td>Elle s’inscrit et paie aujourd’hui</td>
<td><span className="menu">Finance</span> › <span className="menu">Nouveau reçu</span> › <span className="ui">Nouvel apprenant</span>. Détail ci-dessous.</td>
</tr>
<tr>
<td>Elle veut réserver sans rien payer aujourd’hui</td>
<td>Une inscription n’existe qu’une fois payée&nbsp;: tout montant supérieur à zéro suffit. Sinon, enregistrez-la comme prospect (<span className="menu">Opportunités</span> › <span className="ui">Ajouter un prospect</span>) et inscrivez-la le jour du paiement. Rien ne réserve une place sans paiement.</td>
</tr>
<tr>
<td>L’apprenant est déjà connu (ancien élève, frère ou sœur)</td>
<td><span className="menu">Nouveau reçu</span> › <span className="ui">Rechercher un apprenant</span>, pour ne pas créer de doublon.</td>
</tr>
<tr>
<td>Vous voulez seulement créer le dossier, sans paiement</td>
<td><span className="menu">Apprenants</span> › <span className="menu">Ajouter un apprenant</span> (<a href="#q2">Q2</a>). Cherchez-le d’abord dans la Liste des apprenants&nbsp;: ce formulaire ne détecte aucun doublon.</td>
</tr>
</tbody>
</table>
</div>
<h4>S’inscrire et payer aujourd’hui</h4>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Finance</span> › <span className="menu">Nouveau reçu</span>. Commencez par <span className="ui">Rechercher un apprenant</span> pour vérifier qu’il n’existe pas déjà.</p>
</li>
<li><p>S’il n’existe pas, cliquez sur l’onglet <span className="ui">Nouvel apprenant</span> et saisissez le <span className="ui">Nom complet</span>. C’est le seul champ obligatoire&nbsp;: téléphone et emails sont facultatifs mais précieux.</p>
</li>
<li><p>Regardez le bloc <b>Dossiers ressemblants</b> qui s’affiche. Si c’est la même personne, cliquez sur le dossier. Sinon continuez&nbsp;: un homonyme est autorisé. Si le même téléphone, ou le même nom avec la même date de naissance, existe déjà, <b>Doublon possible</b> s’affiche à l’enregistrement&nbsp;: répondez pour chaque fiche (<span className="ui">Même famille, autre personne</span> ou <span className="ui">Personne différente</span>) puis enregistrez à nouveau. Une famille peut partager un numéro.</p>
</li>
<li><p><b>Étape 2.</b> Choisissez la <span className="ui">Session</span> et l’<span className="ui">Année scolaire</span> (2026/2027 par défaut), puis éventuellement le <span className="ui">Niveau</span>. Une fois le niveau choisi, <span className="ui">Groupe (facultatif)</span> propose les groupes de ce programme, de ce niveau et de cette année, avec les places libres&nbsp;; un groupe complet apparaît grisé («&nbsp;complet&nbsp;») et ne peut pas être choisi. Vous pouvez aussi affecter le groupe plus tard (<a href="#q9">Q9</a>).</p>
</li>
<li><p><b>Étape 3.</b> Saisissez le <span className="ui">Prix brut convenu</span>, la <span className="ui">Remise</span> (avec son motif) et l’<span className="ui">Échéance</span> si besoin, le <span className="ui">Montant payé aujourd’hui</span>, la <span className="ui">Date du paiement</span> et le <span className="ui">Mode de paiement</span> (Espèces par défaut, Carte bancaire, Virement, Chèque). Les règles sont juste en dessous.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer et générer le reçu</span>. Tout montant supérieur à zéro confirme l’inscription&nbsp;: «&nbsp;Paiement enregistré. Inscription confirmée.&nbsp;» si vous avez choisi un groupe, sinon «&nbsp;Paiement enregistré. Apprenant inscrit — groupe à affecter.&nbsp;» Le reçu s’ouvre.</p>
</li>
<li><p>Imprimez avec <span className="ui">Imprimer A5</span> ou téléchargez avec <span className="ui">PDF A5</span>. Sans groupe, passez ensuite au <a href="#q9">scénario Q9</a>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s10-receipt-new.jpg" width={1700} height={1075} alt="Formulaire Encaisser un paiement avec l’onglet Nouvel apprenant et le bloc Dossiers ressemblants" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>L’onglet <span className="ui">Nouvel apprenant</span>.</li>
<li><span className="ui">Nom complet</span>&nbsp;: tapez-le en entier pour déclencher la recherche de doublons.</li>
<li><b>Dossiers ressemblants</b>&nbsp;: cliquez sur le bon dossier si la personne existe déjà.</li>
</ol>
</figure>
<figure className="fig narrow">
<Image src="/helpdesk/s11b-receipt.jpg" width={1700} height={1075} alt="Reçu de paiement avec le détail du prix, du montant payé et du solde restant" unoptimized tabIndex={0} role="button" /><figcaption>Le reçu, avec <span className="ui">PDF A5</span> et <span className="ui">Imprimer A5</span> en haut.</figcaption>
</figure>
<div className="callout info">
<strong>Imprimer</strong><p>Le reçu est au format A5. Dans le lecteur PDF qui s’ouvre, choisissez A5 et l’échelle réelle (100 %).</p>
</div>
<h4 id="regles-paiement">Remise, date et acompte&nbsp;: les règles</h4>
<p>Elles valent pour tout paiement&nbsp;: <span className="menu">Nouveau reçu</span>, <span className="ui">Encaisser</span> depuis la fiche de l’apprenant, ou paiement d’une inscription venue du CRM (<a href="#c6">C6</a>).</p>
<div className="scroll">
<table>
<thead>
<tr>
<th>Règle</th>
<th>Ce que vous voyez</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>Toute remise a un motif.</b> Dès que <span className="ui">Remise (MAD)</span> dépasse 0, le champ <span className="ui">Motif de la remise</span> apparaît et devient obligatoire&nbsp;: Fratrie, Ancien élève, Promotion/offre, Accord de la direction ou Autre. Avec «&nbsp;Autre&nbsp;», précisez en quelques mots dans <span className="ui">Précisez le motif</span> (3 à 200 caractères).</td>
<td>Sans motif&nbsp;: «&nbsp;Indiquez le motif de la remise.&nbsp;» «&nbsp;Autre&nbsp;» sans précision&nbsp;: «&nbsp;Précisez le motif de la remise «&nbsp;Autre&nbsp;».&nbsp;»</td>
</tr>
<tr>
<td><b>Pas de plafond pour vous.</b> Vous pouvez accorder la remise convenue, quel que soit son montant, du moment qu’elle a un motif. La direction voit chaque nouvelle remise dans sa liste «&nbsp;Contrôles&nbsp;».</td>
<td>Rien de plus à faire. Le motif reste interne&nbsp;: il n’est jamais imprimé sur le reçu ni envoyé à la famille.</td>
</tr>
<tr>
<td><b>La date du paiement</b> n’est jamais dans le futur, et au plus 7 jours en arrière pour vous. Le rappel est écrit sous le champ&nbsp;: «&nbsp;Jamais dans le futur&nbsp;; au plus 7 jours en arrière.&nbsp;»</td>
<td>«&nbsp;La date du paiement ne peut pas être dans le futur (aujourd’hui à Casablanca&nbsp;: …).&nbsp;» ou «&nbsp;… antérieure de plus de 7 jours.&nbsp;» Pour un paiement plus ancien, demandez à la direction.</td>
</tr>
<tr>
<td><b>Tout paiement confirme.</b> Un montant supérieur à zéro, quel qu’il soit, confirme l’inscription. Le reste à payer est suivi comme d’habitude («&nbsp;Acompte versé&nbsp;», «&nbsp;En retard&nbsp;», <a href="#q4">Q4</a>).</td>
<td>«&nbsp;Paiement enregistré. Inscription confirmée.&nbsp;» ou «&nbsp;Paiement enregistré. Apprenant inscrit — groupe à affecter.&nbsp;»</td>
</tr>
<tr>
<td><b>Remise de 100&nbsp;% (inscription gratuite).</b> Une remise égale au prix, avec son motif, et 0 payé confirme l’inscription sans reçu. La direction la voit dans «&nbsp;Contrôles&nbsp;».</td>
<td>«&nbsp;Remise de 100&nbsp;%&nbsp;: inscription confirmée sans paiement (visible dans Contrôles).&nbsp;» Le bouton devient <span className="ui">Enregistrer et confirmer l’inscription</span>.</td>
</tr>
</tbody>
</table>
</div>
<div className="callout warn">
<strong>Montant à 0 sans remise totale&nbsp;: rien n’est confirmé</strong><p>La plateforme enregistre seulement l’engagement, sans reçu&nbsp;: il n’y a pas d’inscription et pas de groupe à affecter. Pour inscrire, encaissez un paiement.</p>
</div>
<div className="callout info">
<strong>Le groupe n’a pas pu être affecté&nbsp;?</strong><p>Le paiement reste enregistré&nbsp;: «&nbsp;Paiement enregistré. Groupe non affecté&nbsp;: …&nbsp;Apprenant inscrit — groupe à affecter.&nbsp;» Affectez un autre groupe avec le <a href="#q9">scénario Q9</a>.</p>
</div>
<div className="callout warn">
<strong>Terminez ensuite le dossier</strong><p>Un apprenant créé depuis le reçu n’a que son nom et ses contacts. Complétez la date de naissance et la catégorie depuis sa fiche (<span className="ui">Modifier</span>, <a href="#q2">Q2</a>).</p>
</div>
<div className="callout stop">
<strong>Ne saisissez pas deux fois</strong><p>Avant d’enregistrer, la plateforme cherche un reçu identique&nbsp;: même apprenant, même montant, même jour et même engagement, ou un reçu que vous avez enregistré pour cet apprenant il y a moins de 2 minutes. Si elle en trouve un, le cadre «&nbsp;Ce paiement est peut-être déjà enregistré&nbsp;» montre son numéro, sa date, son montant et son engagement, et rien n’est enregistré. Vérifiez ce reçu&nbsp;: <span className="ui">Annuler</span> s’il s’agit du même paiement, <span className="ui">C’est un autre paiement</span> sinon. La même vérification existe dans <span className="ui">Inscrire et encaisser</span>.</p>
</div>
</article>
<article className="scn" id="q4">
<header className="scn-head">
<p className="kicker">Scénario Q4</p>
<h3>Encaisser un acompte ou un solde</h3>
<p className="when">L’apprenant existe et a déjà un engagement avec un reste à payer.</p>
</header>
<figure className="fig">
<Image src="/helpdesk/s12-student-file.jpg" width={1700} height={1625} alt="Fiche d’un apprenant avec la situation des paiements et les inscriptions" unoptimized tabIndex={0} role="button" /><figcaption>La fiche de l’apprenant&nbsp;: ses paiements en cours et ses inscriptions.</figcaption>
<ol className="legend">
<li><b>Situation des paiements</b>&nbsp;: le solde actuel de chaque engagement.</li>
<li><b>Inscriptions et groupes</b>&nbsp;: l’état de chaque inscription.</li>
<li><span className="ui">Inscrire et encaisser</span>&nbsp;: une nouvelle inscription, payée en même temps (<a href="#q7">Q7</a>).</li>
<li><span className="ui">Encaisser</span>&nbsp;: ouvre le formulaire de paiement déjà rempli pour cet engagement.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant, puis cliquez sur <span className="ui">Encaisser</span> à côté de l’engagement. Ou&nbsp;: <span className="menu">Nouveau reçu</span> › <span className="ui">Rechercher un apprenant</span>&nbsp;: le formulaire s’ouvre sur le plus ancien solde ouvert, déjà sélectionné. Pour un autre engagement, cliquez sur <span className="ui">Encaisser sur cet engagement</span> sur sa ligne&nbsp;; pour un nouvel engagement, sur <span className="ui">Nouvelle inscription</span>.</p>
<p>Un engagement «&nbsp;Réservé pour un prospect&nbsp;» ne s’encaisse pas ici&nbsp;: <span className="ui">Ouvrir le prospect</span>, puis <span className="ui">Inscrire et encaisser</span>, pour que le paiement confirme l’inscription du prospect.</p>
</li>
<li><p>Les conditions de l’engagement sont verrouillées. Vous voyez <b>Prix net</b>, <b>Déjà payé</b> et <b>Solde</b>.</p>
</li>
<li><p>Saisissez le montant payé aujourd’hui, qui ne peut pas dépasser le solde (sinon&nbsp;: «&nbsp;Le paiement dépasse le solde de … MAD&nbsp;»), et vérifiez la <span className="ui">Date du paiement</span> (jamais dans le futur, au plus 7 jours en arrière). Puis <span className="ui">Enregistrer et générer le reçu</span>.</p>
</li>
</ol>
<p>Pas de champ remise ici&nbsp;: la remise fait partie des conditions de l’engagement, fixées à sa création.</p>
<p>Chaque paiement donne un nouveau reçu. Les reçus précédents ne changent jamais&nbsp;: le «&nbsp;restant historique&nbsp;» est le solde à la date de chaque reçu, alors que «&nbsp;Situation des paiements&nbsp;» montre le solde d’aujourd’hui.</p>
<p>Pour retrouver ensuite le reçu ou la liste des impayés&nbsp;: <a href="#q6">Q6</a> et <a href="#q5">Q5</a>. Dans <span className="menu">Tous les reçus</span>, le bouton <span className="ui">Avec solde</span> ne garde que les reçus dont l’engagement a encore un reste à payer aujourd’hui.</p>
<p>Les états de paiement&nbsp;: <b>Soldé</b>, <b>Acompte versé</b>, <b>En attente</b> (rien de payé, échéance pas dépassée), <b>En retard</b> (échéance dépassée), <b>Aucun engagement</b>.</p>
</article>
<article className="scn" id="q5">
<header className="scn-head">
<p className="kicker">Scénario Q5</p>
<h3>Suivre les impayés</h3>
<p className="when">Vous voulez savoir qui n’a pas encore tout payé, par exemple avant d’appeler les familles.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Liste des apprenants</span>, puis cliquez sur <span className="ui">Plus de filtres</span>.</p>
</li>
<li><p>Dans <span className="ui">Filtrer par paiement</span>, choisissez ce que vous cherchez&nbsp;: <span className="ui">Reste à payer (tous)</span> pour tous ceux qui doivent encore de l’argent, <span className="ui">En retard</span> pour l’échéance dépassée, ou <span className="ui">Acompte versé</span>, <span className="ui">En attente</span>, <span className="ui">Soldé</span>, <span className="ui">Aucun engagement</span>.</p>
</li>
<li><p>La colonne <b>Paiement</b> donne l’état et le <b>solde restant actuel</b> en MAD. Le téléphone est dans la ligne&nbsp;: vous pouvez appeler la famille.</p>
</li>
<li><p>Cliquez sur le nom pour ouvrir la fiche, puis sur <span className="ui">Encaisser</span> quand la famille paie (<a href="#q4">Q4</a>).</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q05-impayes.jpg" width={1700} height={1075} alt="Liste des apprenants filtrée sur Reste à payer avec deux apprenants en acompte versé et leur solde restant" unoptimized tabIndex={0} role="button" /><figcaption>La liste filtrée sur <span className="ui">Reste à payer (tous)</span>.</figcaption>
<ol className="legend">
<li><span className="ui">Plus de filtres</span>&nbsp;: le chiffre à côté indique le nombre de filtres actifs.</li>
<li><span className="ui">Filtrer par paiement</span>.</li>
<li>L’état du paiement et le solde restant actuel de chaque apprenant.</li>
</ol>
</figure>
<div className="callout info">
<strong>Bon à savoir</strong><ul className="tight">
<li>Les filtres se cumulent&nbsp;: ajoutez une session, un niveau ou une catégorie pour réduire la liste. <span className="ui">Effacer les filtres</span> remet tout à zéro.</li>
<li>Par défaut, seuls les «&nbsp;Dossiers actifs&nbsp;» sont listés&nbsp;: choisissez <span className="ui">Tous les statuts</span> pour voir les autres.</li>
<li>Le solde affiché est celui d’aujourd’hui. Un reçu garde le solde de sa date (<a href="#q4">Q4</a>).</li>
</ul>
</div>
</article>
<article className="scn" id="q6">
<header className="scn-head">
<p className="kicker">Scénario Q6</p>
<h3>Retrouver, imprimer ou renvoyer un reçu</h3>
<p className="when">Un parent demande une copie, le reçu n’est pas arrivé par email, ou vous préparez plusieurs reçus à la fois.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Finance</span> › <span className="menu">Tous les reçus</span>. Les reçus sont classés du plus récent au plus ancien.</p>
</li>
<li><p>Cherchez par <b>nom d’apprenant</b> ou par <b>numéro de reçu</b> (de la forme EH-2026-…).</p>
</li>
<li><p>Cliquez sur le numéro du reçu pour l’ouvrir. En haut, <span className="ui">PDF A5</span> le télécharge et <span className="ui">Imprimer A5</span> l’imprime. Si l’envoi par email avait échoué, <span className="ui">Réessayer l’email</span> apparaît.</p>
</li>
<li><p>Pour plusieurs reçus à la fois, cochez les lignes (la case de l’en-tête sélectionne tout), puis cliquez sur <span className="ui">PDF (N)</span>&nbsp;: un seul fichier est téléchargé.</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q06-recus.jpg" width={1700} height={1075} alt="Page Reçus de paiement avec la recherche, la case de sélection, le bouton PDF (2) et le bouton Encaisser" unoptimized tabIndex={0} role="button" /><figcaption>La page <span className="menu">Tous les reçus</span>, avec deux reçus sélectionnés.</figcaption>
<ol className="legend">
<li>Recherche par nom ou numéro de reçu.</li>
<li>La case de l’en-tête coche ou décoche toutes les lignes.</li>
<li><span className="ui">PDF (N)</span>&nbsp;: télécharge les reçus cochés, N est leur nombre.</li>
<li><span className="ui">Encaisser</span>&nbsp;: ouvre le formulaire de paiement (<a href="#q3">Q3</a> et <a href="#q4">Q4</a>).</li>
</ol>
</figure>
<div className="callout warn">
<strong>Un reçu ne se modifie pas</strong><p>Un reçu annulé est marqué «&nbsp;Annulé&nbsp;» dans la liste. Pour corriger un montant, un nom ou un mode de paiement, il faut que la direction annule le paiement&nbsp;: voir <a href="#err">J’ai fait une erreur</a>. Pour imprimer, choisissez A5 et l’échelle réelle (100&nbsp;%).</p>
</div>
</article>
<article className="scn" id="q7">
<header className="scn-head">
<p className="kicker">Scénario Q7</p>
<h3>Inscrire et encaisser depuis la fiche apprenant</h3>
<p className="when">L’apprenant a déjà un dossier (ancien élève, réinscription, dossier créé avec <a href="#q2">Q2</a>) et s’inscrit à un programme. L’inscription et le premier paiement se font ensemble.</p>
</header>
<p>Une inscription n’existe qu’une fois payée&nbsp;: tout montant supérieur à zéro la confirme. Il n’y a plus d’inscription «&nbsp;en attente&nbsp;» à préparer puis valider.</p>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant (<a href="#q1">Q1</a>). Dans la section <b>Inscriptions et groupes</b>, cliquez sur <span className="ui">Inscrire et encaisser</span>.</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q07-fiche-inscrire.jpg" width={1700} height={1075} alt="Fiche d’un apprenant avec le bouton Inscrire et encaisser dans la section Inscriptions et groupes" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Inscrire et encaisser</span>&nbsp;: ouvre le formulaire de paiement, l’apprenant déjà choisi.</li>
<li>Sans inscription, la fiche l’indique&nbsp;: l’affectation à un groupe passe par une inscription payée.</li>
</ol>
</figure>
<ol className="steps" style={{ counterReset: 'st 1' }}>
<li><p>Le formulaire <span className="menu">Nouveau reçu</span> s’ouvre avec l’apprenant déjà choisi. Choisissez la <span className="ui">Session</span>, l’<span className="ui">Année scolaire</span> et le <span className="ui">Niveau</span>, puis, si vous le connaissez, le <span className="ui">Groupe (facultatif)</span>&nbsp;: seuls les groupes de ce programme, de ce niveau et de cette année sont proposés, avec leurs places libres.</p>
</li>
<li><p>Saisissez le prix, la remise éventuelle avec son motif, le <span className="ui">Montant payé aujourd’hui</span>, la date et le mode de paiement (règles&nbsp;: <a href="#regles-paiement">Q3</a>), puis <span className="ui">Enregistrer et générer le reçu</span>.</p>
</li>
<li><p>«&nbsp;Paiement enregistré. Inscription confirmée.&nbsp;» (avec un groupe) ou «&nbsp;Paiement enregistré. Apprenant inscrit — groupe à affecter.&nbsp;» (sans groupe). Le reçu s’ouvre. Sans groupe, affectez-le plus tard (<a href="#q9">Q9</a>).</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q07b-encaisser-groupe.jpg" width={1700} height={1075} alt="Formulaire Encaisser un paiement avec la session, l’année scolaire, le niveau et le champ Groupe facultatif" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Session</span>, <span className="ui">Année scolaire</span> et <span className="ui">Niveau</span>&nbsp;: le programme de l’inscription.</li>
<li><span className="ui">Groupe (facultatif)</span>&nbsp;: les places libres sont indiquées&nbsp;; un groupe complet apparaît grisé («&nbsp;complet&nbsp;») et ne peut pas être choisi.</li>
<li><span className="ui">Montant payé aujourd’hui</span>&nbsp;: tout montant supérieur à zéro confirme.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Pas de paiement, pas d’inscription</strong><p>Avec 0 payé (et sans remise totale), seul l’engagement est enregistré&nbsp;: pas d’inscription, pas de groupe. Pour une personne qui hésite, créez plutôt un prospect (<a href="#c1">C1</a>). Les anciennes inscriptions «&nbsp;en attente&nbsp;» d’avant ce changement ont été retirées&nbsp;: elles restent lisibles dans l’historique de la fiche, terminées avec leur motif.</p>
</div>
</article>
<article className="scn" id="q8">
<header className="scn-head">
<p className="kicker">Scénario Q8</p>
<h3>Créer ou modifier un groupe, lui donner un enseignant</h3>
<p className="when">Un nouveau groupe ouvre, ou l’enseignant, l’horaire, la salle ou la capacité d’un groupe change.</p>
</header>
<h4>Créer un groupe</h4>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Académique</span> › <span className="menu">Groupes &amp; niveaux</span>, puis cliquez sur <span className="ui">Nouveau groupe</span>.</p>
</li>
<li><p>Saisissez le <span className="ui">Nom du groupe</span> (obligatoire). Suivez l’usage de l’équipe, par exemple «&nbsp;Child 2 · Samedi après-midi&nbsp;». <b>Un nom de groupe ne contient jamais le nom d’un apprenant</b>&nbsp;: pour un cours individuel (One-to-One), la plateforme propose «&nbsp;Cours individuel · niveau · date de début&nbsp;».</p>
</li>
<li><p>Choisissez la <span className="ui">Session</span> puis le <span className="ui">Niveau</span> (la liste des niveaux dépend de la session) et la <span className="ui">Catégorie</span>.</p>
</li>
<li><p><b>Choisissez l’<span className="ui">Enseignant</span></b>&nbsp;: c’est le champ qui <b>lie le groupe à son enseignant</b>, et il est obligatoire.</p>
</li>
<li><p>Renseignez la <span className="ui">Salle</span>, les <span className="ui">Jours de cours</span> (cliquez sur chaque jour, par exemple Lun, Mer et Ven), l’<span className="ui">Horaire</span> (par exemple «&nbsp;18h – 19h30&nbsp;»), la <span className="ui">Capacité max</span> et le <span className="ui">Terme</span>.</p>
</li>
<li><p>Vérifiez l’<span className="ui">Année scolaire</span>&nbsp;: elle est obligatoire et proposée automatiquement (l’année en cours, du 1<sup>er</sup> septembre au 31 août). Pour un groupe de la rentrée suivante, changez-la. Format&nbsp;: deux années qui se suivent, avec une barre, par exemple <b>2026/2027</b>.</p>
</li>
<li><p>Renseignez la <span className="ui">Date de début</span> et la <span className="ui">Date de fin</span> du cours. Elles sont <b>obligatoires pour Mise à niveau, Adults, Summer Camp et One-to-One</b>, facultatives pour Yearly et Communication. Un cours en ligne n’en a pas ici&nbsp;: ses dates se modifient sur sa page Cours en ligne. Les dates restent dans l’année scolaire du groupe, du 1<sup>er</sup> juin au 31 août suivant (pour 2026/2027&nbsp;: du 1<sup>er</sup> juin 2026 au 31 août 2027). Un cours individuel (One-to-One) a une capacité de 1.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>&nbsp;: le message «&nbsp;Groupe créé&nbsp;» s’affiche.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q08-groupe-formulaire.jpg" width={1700} height={1075} alt="Fenêtre Nouveau groupe pour une Mise à niveau avec le nom, l’enseignant, les jours, l’année scolaire 2026/2027, les dates du cours et le bouton Enregistrer" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Nom du groupe</span>&nbsp;: obligatoire.</li>
<li><span className="ui">Enseignant</span>&nbsp;: obligatoire. Il choisit parmi les enseignants existants.</li>
<li><span className="ui">Jours de cours</span>&nbsp;: un bouton par jour. Les <b>Présences</b> et l’<b>Emploi du temps</b> s’en servent.</li>
<li><span className="ui">Année scolaire</span>&nbsp;: obligatoire, proposée automatiquement, au format 2026/2027.</li>
<li><span className="ui">Date de début</span> et <span className="ui">Date de fin</span>&nbsp;: obligatoires pour les programmes courts.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Les messages sur les dates</strong><ul className="tight">
<li>«&nbsp;Renseignez les dates du cours&nbsp;: date de début et date de fin.&nbsp;»&nbsp;: un programme court (Mise à niveau, Adults, Summer Camp, One-to-One) a besoin des deux dates.</li>
<li>«&nbsp;Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).&nbsp;»&nbsp;: corrigez la date ou l’année scolaire.</li>
<li>«&nbsp;La date de fin doit suivre la date de début.&nbsp;»</li>
<li>«&nbsp;Un cours individuel (One-to-One) a une capacité de 1.&nbsp;»</li>
</ul>
</div>
<h4>Modifier un groupe, changer d’enseignant</h4>
<p>Dans la liste, cliquez sur l’icône de modification à droite de la ligne du groupe. La fenêtre «&nbsp;Modifier le groupe&nbsp;» s’ouvre&nbsp;: changez l’<span className="ui">Enseignant</span>, l’horaire, la salle ou la capacité, puis <span className="ui">Enregistrer</span> («&nbsp;Groupe mis à jour&nbsp;»). La page du groupe (clic sur son nom) montre ses apprenants et son année scolaire (<a href="#q10">Q10</a>).</p>
<div className="callout warn">
<strong>L’année scolaire d’un groupe avec des apprenants</strong><p>Un groupe ne reçoit que des inscriptions de son année. Tant qu’il compte des apprenants inscrits pour une autre année que celle que vous saisissez, son année ne change pas&nbsp;: «&nbsp;Réaffectez les apprenants avant de changer l’année scolaire du groupe.&nbsp;» En pratique, corrigez l’année d’un groupe avant d’y placer des apprenants. Pour la rentrée suivante, créez plutôt un nouveau groupe avec la nouvelle année. Le programme et le niveau d’un groupe déjà utilisé ne changent pas non plus.</p>
</div>
<div className="callout info">
<strong>Bon à savoir</strong><ul className="tight">
<li>L’enseignant doit exister dans la plateforme. Un nouvel enseignant&nbsp;: <span className="menu">Enseignants</span> › <span className="ui">Ajouter</span> (<a href="#q12">Q12</a>).</li>
<li>La capacité est une limite&nbsp;: pour ajouter un apprenant à un groupe «&nbsp;complet&nbsp;», la plateforme demande un motif, noté dans l’historique.</li>
<li>Vous ne pouvez pas supprimer un groupe&nbsp;: demandez à la direction.</li>
<li>Un cours terminé est <b>clôturé par la direction</b>. Un cours clôturé n’accepte plus d’apprenant et quitte les listes de choix, les présences et l’emploi du temps. Ses dates, son année, son programme, son niveau et sa capacité ne changent plus («&nbsp;Ce cours est clôturé. Rouvrez le cours pour le modifier.&nbsp;»)&nbsp;; son nom, son enseignant, sa salle et son horaire restent modifiables. Seule la direction peut le rouvrir.</li>
<li>Après avoir créé ou changé les jours, vérifiez le résultat dans l’<span className="menu">Emploi du temps</span> (<a href="#q13">Q13</a>).</li>
</ul>
</div>
</article>
<article className="scn" id="q9">
<header className="scn-head">
<p className="kicker">Scénario Q9</p>
<h3>Affecter un groupe</h3>
<p className="when">Un apprenant est inscrit mais n’a pas encore de groupe («&nbsp;Inscrit — groupe à affecter&nbsp;»).</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Liste des apprenants</span>. Cliquez sur <span className="ui">Plus de filtres</span> puis choisissez <span className="ui">Groupe à affecter</span> dans «&nbsp;Filtrer par affectation de groupe&nbsp;».</p>
</li>
<li><p>Dans la colonne <b>Groupe</b>, cliquez sur le lien bleu <span className="ui">Groupe à affecter · …</span> de la personne.</p>
</li>
<li><p>Dans la fenêtre <b>Affecter un groupe</b>, le haut rappelle la session, l’année et le niveau de l’inscription. Vérifiez le niveau et choisissez le <span className="ui">Groupe</span>. Seuls les groupes du <b>même programme, du même niveau et de la même année scolaire</b> sont proposés.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span> («&nbsp;Mis à jour&nbsp;»). L’inscription passe à <b>Inscription validée</b>.</p>
</li>
</ol>
<div className="callout warn">
<strong>Le bon groupe n’est pas dans la liste, ou «&nbsp;L’année scolaire de l’inscription… ne correspond pas…&nbsp;»</strong><p>Le message complet est&nbsp;: «&nbsp;L’année scolaire de l’inscription (2025/2026) ne correspond pas à celle du groupe (2026/2027).&nbsp;» (avec les années de votre cas). Un groupe n’accepte que les inscriptions de son année&nbsp;: rien n’est enregistré.</p>
<ul className="tight">
<li>Comparez l’année de l’inscription (en haut de la fenêtre) et celle du groupe (sur sa page, ligne <b>Année scolaire</b>).</li>
<li>Si le groupe de la bonne année existe, choisissez-le. S’il n’existe pas, créez-le avec cette année (<a href="#q8">Q8</a>), puis affectez.</li>
<li>Si c’est l’année de l’inscription qui est fausse, vous ne pouvez pas la changer&nbsp;: demandez à la direction.</li>
</ul>
</div>
<figure className="fig narrow">
<Image src="/helpdesk/s13-students-filter.jpg" width={1700} height={1075} alt="Liste des apprenants filtrée sur Groupe à affecter" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Plus de filtres</span> donne accès au filtre d’affectation.</li>
<li>Le lien <span className="ui">Groupe à affecter · …</span> ouvre la fenêtre d’affectation.</li>
</ol>
</figure>
<figure className="fig narrow">
<Image src="/helpdesk/s14-assign.jpg" width={1700} height={1075} alt="Fenêtre Affecter un groupe avec le niveau et le groupe" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Niveau de cette inscription</span>.</li>
<li><span className="ui">Groupe</span>&nbsp;: filtré par session, niveau et année scolaire.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<div className="callout info">
<strong>Bon à savoir</strong><ul className="tight">
<li>La liste ne montre par défaut que les «&nbsp;Dossiers actifs&nbsp;». Pour voir aussi les prospects, choisissez <span className="ui">Tous les statuts</span>.</li>
<li>Dans la colonne <b>Groupe</b>, «&nbsp;Groupe à affecter&nbsp;» n’apparaît que pour une inscription payée sans groupe («&nbsp;Inscrit — groupe à affecter&nbsp;»). Un dossier <b>Sans inscription</b>, <b>Ancien apprenant</b> ou <b>Inactif</b> sans inscription en cours affiche «&nbsp;—&nbsp;»&nbsp;: il n’y a rien à affecter. Pour l’inscrire, ouvrez sa fiche › <span className="ui">Inscrire et encaisser</span> (<a href="#q7">Q7</a>).</li>
<li>Un dossier actif sans inscription payée affiche <span className="ui">Inscrire et encaisser</span>&nbsp;: c’est la voie normale, l’affectation suit le paiement. Pour l’affecter quand même, choisissez-le sur la page du groupe (il est marqué «&nbsp;sans inscription payée&nbsp;»)&nbsp;: la fenêtre «&nbsp;Affectation sans inscription payée&nbsp;» demande un <span className="ui">Motif de l’affectation sans inscription payée</span>. Le motif est noté dans le journal et l’inscription apparaît dans «&nbsp;Contrôles&nbsp;» jusqu’au paiement.</li>
<li>L’autre voie&nbsp;: <span className="menu">Groupes &amp; niveaux</span> › le groupe › <span className="ui">Ajouter des apprenants</span>. Elle refuse certains cas (plusieurs inscriptions en attente). Le lien de la liste est plus fiable.</li>
<li>Pour changer quelqu’un de groupe, ou le sortir d’un groupe&nbsp;: <a href="#q10">Q10</a>.</li>
<li>Un cours clôturé n’est jamais proposé. Si l’affectation est tentée autrement, la plateforme répond «&nbsp;Ce cours est clôturé.&nbsp;»&nbsp;: choisissez un autre cours, ou demandez à la direction s’il a été clôturé par erreur.</li>
<li>Un cours terminé mais pas encore clôturé reste proposé avec «&nbsp;· terminé le …&nbsp;»&nbsp;: c’est pour placer un apprenant oublié avant la clôture. Pour un nouveau départ, choisissez le cours suivant.</li>
<li>«&nbsp;Renseignez les dates du cours avant d’y affecter un apprenant.&nbsp;»&nbsp;: complétez d’abord les dates du groupe (<a href="#q8">Q8</a>).</li>
<li>La capacité d’un groupe est une limite&nbsp;: un groupe «&nbsp;complet&nbsp;» n’accepte un nouvel apprenant qu’avec un motif, noté dans l’historique. Pour créer le groupe qui manque&nbsp;: <a href="#q8">Q8</a>.</li>
</ul>
</div>
</article>
<article className="scn" id="q10">
<header className="scn-head">
<p className="kicker">Scénario Q10</p>
<h3>Changer un apprenant de groupe, ou le retirer</h3>
<p className="when">Un apprenant change de créneau, ou quitte son groupe.</p>
</header>
<h4>Le changer de groupe</h4>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant (<a href="#q1">Q1</a>). Dans <b>Inscriptions et groupes</b>, cliquez sur <span className="ui">Modifier l’inscription</span> à côté de l’inscription concernée.</p>
</li>
<li><p>Dans la fenêtre <b>Affecter un groupe</b>, choisissez le nouveau <span className="ui">Groupe</span>. Seuls les groupes du même programme, du même niveau et de la même année scolaire que l’inscription sont proposés. L’encadré vert rappelle l’horaire, le jour, la salle et la capacité.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q10-changer-groupe.jpg" width={1700} height={1075} alt="Fenêtre Affecter un groupe ouverte depuis la fiche d’un apprenant déjà inscrit, avec le choix du groupe" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Groupe</span>&nbsp;: filtré par session, niveau et année scolaire de l’inscription.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<p>Le groupe voulu n’apparaît pas, ou l’enregistrement répond «&nbsp;L’année scolaire de l’inscription (…) ne correspond pas à celle du groupe (…).&nbsp;»&nbsp;: le groupe est d’une autre année. Choisissez un groupe de l’année de l’inscription, ou créez-le (<a href="#q8">Q8</a>)&nbsp;; si c’est l’année de l’inscription qui est fausse, demandez à la direction. Détail en <a href="#q9">Q9</a>.</p>
<h4>Le retirer d’un groupe</h4>
<p>Ouvrez la page du groupe (<span className="menu">Groupes &amp; niveaux</span>, clic sur le nom) et cliquez sur <span className="ui">Retirer</span> à droite de l’apprenant. Une inscription validée redevient «&nbsp;Inscrit — groupe à affecter&nbsp;» (<a href="#q9">Q9</a>).</p>
<figure className="fig narrow">
<Image src="/helpdesk/q10b-page-groupe.jpg" width={1700} height={1075} alt="Page d’un groupe avec l’enseignant, le bouton Ajouter des apprenants et le bouton Retirer" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>L’enseignant du groupe&nbsp;: un clic ouvre son profil.</li>
<li><span className="ui">Ajouter des apprenants</span>&nbsp;: pour les apprenants qui n’ont pas encore de groupe.</li>
<li><span className="ui">Retirer</span>&nbsp;: sort l’apprenant du groupe.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Depuis la page du groupe, on n’ajoute pas quelqu’un qui a déjà un groupe</strong><p>Si vous essayez, la plateforme répond «&nbsp;Select an enrollment explicitly&nbsp;». Passez par la fiche de l’apprenant, <span className="ui">Modifier l’inscription</span>. Si vous hésitez, <span className="ui">Retirer</span> d’abord, puis affectez le nouveau groupe.</p>
</div>
</article>
<article className="scn" id="q11">
<header className="scn-head">
<p className="kicker">Scénario Q11</p>
<h3>Prendre les présences</h3>
<p className="when">À chaque séance, pour chaque groupe.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Académique</span> › <span className="menu">Présences</span>.</p>
</li>
<li><p>Choisissez le <span className="ui">Groupe</span>. La <span className="ui">Date de séance</span> est celle d’aujourd’hui, et la liste ne propose que les groupes qui ont cours ce jour-là (cochez <span className="ui">Tous les groupes</span> pour les voir tous).</p>
</li>
<li><p>Chaque apprenant est «&nbsp;Non saisi&nbsp;». Cliquez sur <span className="ui">Tous présents</span>, puis sur <span className="ui">Absent</span>, <span className="ui">Retard</span> ou <span className="ui">Justifié</span> pour ceux qui le sont. Vous pouvez aussi marquer chacun un par un.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer les présences</span>&nbsp;: le bouton indique combien de lignes seront enregistrées. Un message confirme «&nbsp;Présences enregistrées&nbsp;».</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s15-attendance.jpg" width={1700} height={1075} alt="Page Gestion des présences avec deux apprenants" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Groupe</span>.</li>
<li><span className="ui">Date de séance</span>.</li>
<li>Le compteur du haut compte ce qui est affiché, «&nbsp;non saisis&nbsp;» compris.</li>
<li><span className="ui">Enregistrer les présences</span>.</li>
</ol>
</figure>
<div className="callout stop">
<strong>Rien n’est enregistré sans votre clic</strong><p>Un apprenant «&nbsp;Non saisi&nbsp;» n’est pas enregistré. Une séance ne s’enregistre pas à l’avance, ni un jour où le groupe n’a pas cours (ses <span className="ui">Jours de cours</span>), ni un jour de fermeture du centre&nbsp;: pour une séance exceptionnelle un jour de fermeture, demandez à la direction.</p>
</div>
<h4>Retrouver ou corriger une ancienne séance</h4>
<ol className="steps">
<li><p>Choisissez le <span className="ui">Groupe</span>, puis cliquez sur <span className="ui">Historique</span>. La liste des séances s’affiche, avec le nombre de présents et d’absents.</p>
</li>
<li><p>Cliquez sur la date de la séance pour la rouvrir, corrigez, puis <span className="ui">Enregistrer les présences</span>.</p>
</li>
<li><p><span className="ui">Saisie du jour</span> vous ramène à la saisie d’aujourd’hui.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q11-presences-historique.jpg" width={1700} height={1075} alt="Page Gestion des présences en mode historique avec la liste des séances d’un groupe" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Saisie du jour</span>&nbsp;: retour à la saisie d’aujourd’hui.</li>
<li>Une date de l’historique&nbsp;: un clic rouvre cette séance.</li>
</ol>
</figure>
<ul className="tight">
<li>Il n’y a pas de verrouillage&nbsp;: une date passée peut toujours être corrigée, par vous comme par n’importe qui. Soyez prudente.</li>
<li>Un apprenant «&nbsp;Inscrit — groupe à affecter&nbsp;» n’apparaît pas&nbsp;: seuls les apprenants du groupe sont listés.</li>
<li><span className="ui">Export CSV</span> télécharge la liste de la séance. Le point de fin de mois est décrit en <a href="#q14">Q14</a>.</li>
</ul>
</article>
<article className="scn" id="q12">
<header className="scn-head">
<p className="kicker">Scénario Q12</p>
<h3>Consulter ou corriger la fiche d’un enseignant</h3>
<p className="when">Vous cherchez les coordonnées d’un enseignant, ou ses niveaux et ses certifications ont changé.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Enseignants</span> › <span className="menu">Liste des enseignants</span>. La recherche filtre la liste.</p>
</li>
<li><p>Chaque carte donne l’email, le téléphone et les niveaux. Cliquez sur le nom pour ouvrir le <b>profil</b>.</p>
</li>
<li><p>Pour corriger, cliquez sur <span className="ui">Modifier</span>. Dans «&nbsp;Modifier le profil enseignant&nbsp;», changez le <span className="ui">Nom complet</span>, le <span className="ui">Téléphone</span>, l’<span className="ui">Email</span>, les <span className="ui">Niveaux autorisés</span>, les <span className="ui">Certifications</span> (CELTA, DELTA, TKT, Licence, Master, Autre), les <span className="ui">Notes</span> ou la <span className="ui">Photo</span>, puis <span className="ui">Enregistrer</span>. Le contrat et la rémunération n’apparaissent pas&nbsp;: ils restent à la direction.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q12-enseignants.jpg" width={1700} height={1075} alt="Liste des enseignants avec la recherche et trois cartes d’enseignants" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>La recherche par nom.</li>
<li>Le nom de l’enseignant&nbsp;: un clic ouvre son profil.</li>
</ol>
</figure>
<figure className="fig narrow">
<Image src="/helpdesk/q12b-enseignant-modifier.jpg" width={1700} height={1075} alt="Formulaire Modifier le profil enseignant avec l’email, les certifications et les niveaux autorisés" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Email</span>&nbsp;: modifiable tant que l’enseignant n’a ni compte ni invitation en attente. Sinon l’enregistrement répond «&nbsp;Un compte ou une invitation utilise cet e-mail&nbsp;: la direction le modifie.&nbsp;»</li>
<li><span className="ui">Certifications</span>&nbsp;: un clic active ou désactive.</li>
<li><span className="ui">Niveaux autorisés</span>&nbsp;: les niveaux en bleu sont ceux que l’enseignant peut donner.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Ajouter un enseignant</strong><p><span className="menu">Enseignants</span> › <span className="ui">Ajouter</span>&nbsp;: nom, téléphone, e-mail (obligatoire), niveaux, certifications et notes. Le contrat et la rémunération sont complétés par la direction&nbsp;; la liste affiche «&nbsp;Contrat à compléter&nbsp;» en attendant. L’enseignant apparaît ensuite dans la liste <span className="ui">Enseignant</span> d’un groupe, et vous pouvez le <b>lier à un groupe</b> comme dans <a href="#q8">Q8</a>. Son e-mail se modifie tant qu’aucun compte enseignant ni invitation ne l’utilise. Les congés sont visibles dans <span className="menu">Congés &amp; absences</span>, en lecture seule.</p>
</div>
<p>Pour voir les groupes d’un enseignant, ouvrez l’<span className="menu">Emploi du temps</span> (<a href="#q13">Q13</a>)&nbsp;: chaque groupe porte le nom de son enseignant.</p>
</article>
<article className="scn" id="q13">
<header className="scn-head">
<p className="kicker">Scénario Q13</p>
<h3>Consulter l’emploi du temps et les notes</h3>
<p className="when">Un parent demande quand et où a lieu le cours, ou vous cherchez les résultats d’une évaluation.</p>
</header>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Académique</span> › <span className="menu">Emploi du temps</span>. La grille va du lundi au dimanche&nbsp;; chaque case est un groupe, avec son horaire, son enseignant et sa salle.</p>
</li>
<li><p>Pour ne voir qu’un terme, choisissez-le en haut à droite (<span className="ui">Tous les termes</span> par défaut).</p>
</li>
<li><p>Cliquez sur le nom d’un groupe pour ouvrir sa page (apprenants, enseignant).</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q13-emploi-du-temps.jpg" width={1700} height={1075} alt="Emploi du temps de la semaine avec les groupes de chaque jour, leur horaire, leur enseignant et leur salle" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>Le filtre par terme.</li>
<li>Un groupe&nbsp;: un clic ouvre sa page.</li>
</ol>
</figure>
<div className="callout info">
<strong>En lecture seule</strong><p>L’emploi du temps ne se modifie pas ici. Un groupe apparaît les jours cochés dans ses <span className="ui">Jours de cours</span>&nbsp;; pour changer un horaire, modifiez le groupe (<a href="#q8">Q8</a>). Un groupe sans jours n’apparaît pas dans la grille.</p>
</div>
<p><span className="menu">Notes &amp; bulletins</span>&nbsp;: vous saisissez et corrigez les notes (apprenant, terme, oral, écrit, finale). La suppression d’une note et l’export CSV restent à la direction. Portfolios et profils d’apprentissage&nbsp;: vous les créez, sans les supprimer. Les certificats sont en lecture seule.</p>
</article>
<article className="scn" id="q14">
<header className="scn-head">
<p className="kicker">Scénario Q14</p>
<h3>La rentrée et la fin de mois</h3>
<p className="when">Deux moments où il faut tout vérifier. Chaque ligne renvoie au scénario qui détaille le geste.</p>
</header>
<div className="cols">
<div className="card">
<h4>À la rentrée</h4>
<ol className="steps">
<li><p><b>Enseignants</b>&nbsp;: chacun est dans la liste, avec ses niveaux et ses certifications à jour (<a href="#q12">Q12</a>). Un nouvel enseignant s’ajoute depuis <span className="menu">Enseignants</span> › <span className="ui">Ajouter</span>.</p>
</li>
<li><p><b>Groupes</b>&nbsp;: créez les groupes de la rentrée, avec enseignant, jours, horaire, salle, capacité, terme, la nouvelle <b>année scolaire</b> et les <b>dates du cours</b> (obligatoires pour les programmes courts) (<a href="#q8">Q8</a>). Un groupe de l’an dernier ne reçoit pas les inscriptions de la nouvelle année.</p>
</li>
<li><p><b>Emploi du temps</b>&nbsp;: relisez la grille, aucun groupe ne manque (<a href="#q13">Q13</a>).</p>
</li>
<li><p><b>Inscriptions</b>&nbsp;: inscrivez et encaissez les réinscriptions depuis les fiches (<a href="#q7">Q7</a>), et complétez les dossiers (<a href="#q2">Q2</a>).</p>
</li>
<li><p><b>Paiements</b>&nbsp;: encaissez à mesure (<a href="#q3">Q3</a>, <a href="#q4">Q4</a>).</p>
</li>
<li><p><b>Groupes à affecter</b>&nbsp;: la liste doit tomber à zéro (<a href="#q9">Q9</a>).</p>
</li>
</ol>
</div>
<div className="card">
<h4>Chaque semaine</h4>
<ul className="tight">
<li>Impayés&nbsp;: <span className="ui">Reste à payer (tous)</span> (<a href="#q5">Q5</a>).</li>
<li>Inscrits sans groupe&nbsp;: filtre «&nbsp;Groupe à affecter&nbsp;» (<a href="#q9">Q9</a>).</li>
<li>Prospects sans prochaine action (<a href="#journee">journée type</a>).</li>
</ul>
</div>
<div className="card">
<h4>En fin de mois</h4>
<ul className="tight">
<li><b>Présences</b>&nbsp;: pour chaque groupe, ouvrez l’<span className="ui">Historique</span> et vérifiez qu’aucune séance ne manque (<a href="#q11">Q11</a>)&nbsp;; <span className="ui">Export CSV</span> si on vous le demande.</li>
<li><b>Impayés</b>&nbsp;: filtre <span className="ui">En retard</span>, puis appelez les familles (<a href="#q5">Q5</a>).</li>
<li><b>Reçus</b>&nbsp;: relisez <span className="menu">Tous les reçus</span> du mois (<a href="#q6">Q6</a>).</li>
<li><b>Dossiers</b>&nbsp;: aucun apprenant ne reste «&nbsp;Groupe à affecter&nbsp;» (<a href="#q9">Q9</a>).</li>
</ul>
</div>
</div>
</article>
</section>
<section className="part" id="partout">
<header>
<h2>Dans les deux parties</h2>
</header>
<article className="scn" id="err">
<header className="scn-head">
<p className="kicker">Dans les deux parties</p>
<h3>J’ai fait une erreur</h3>
<p className="when">Selon l’erreur, vous corrigez seule ou vous demandez à la direction.</p>
</header>
<div className="scroll">
<table>
<thead>
<tr>
<th>Erreur</th>
<th>Qui corrige</th>
<th>Comment</th>
</tr>
</thead>
<tbody>
<tr>
<td>Prospect attribué à la mauvaise personne</td>
<td>Vous</td>
<td><span className="ui">Autres actions</span> › <span className="ui">Changer de responsable</span>.</td>
</tr>
<tr>
<td>Mauvais résultat d’appel ou d’échange</td>
<td>Vous</td>
<td>Notez un nouvel échange avec le bon résultat. L’historique garde les deux&nbsp;; la prochaine action suit le dernier.</td>
</tr>
<tr>
<td>Prospect clôturé par erreur</td>
<td>Vous</td>
<td><span className="ui">Rouvrir le prospect</span>.</td>
</tr>
<tr>
<td>Mauvaise date de rendez-vous ou de test</td>
<td>Vous</td>
<td><span className="ui">Changer</span>, nouvelle date, puis <span className="ui">Remplace le rendez-vous</span> (<a href="#c5">C5</a>).</td>
</tr>
<tr>
<td>Faute dans le nom, le téléphone ou les notes d’un apprenant</td>
<td>Vous</td>
<td>Fiche › <span className="ui">Modifier</span> (<a href="#q2">Q2</a>).</td>
</tr>
<tr>
<td>Mauvais groupe</td>
<td>Vous</td>
<td>Fiche › <span className="ui">Modifier l’inscription</span> (<a href="#q10">Q10</a>), ou page du groupe › <span className="ui">Retirer</span>, puis réaffectez.</td>
</tr>
<tr>
<td>Mauvais enseignant, mauvaise salle, mauvais horaire sur un groupe</td>
<td>Vous</td>
<td><span className="menu">Groupes &amp; niveaux</span> › icône de modification (<a href="#q8">Q8</a>).</td>
</tr>
<tr>
<td>Inscription encaissée par erreur (mauvais programme, mauvais apprenant)</td>
<td><b>La direction</b></td>
<td>Vous ne pouvez pas l’annuler. Prévenez la direction, qui corrige le reçu et l’inscription.</td>
</tr>
<tr>
<td>Mauvais montant, mauvais apprenant, mauvais prix, mauvais mode de paiement sur un reçu</td>
<td><b>La direction</b></td>
<td>Elle annule le paiement. Vous ressaisissez ensuite le bon paiement.</td>
</tr>
<tr>
<td>Reçu créé par erreur</td>
<td><b>La direction</b></td>
<td>Elle le supprime.</td>
</tr>
<tr>
<td>Affecter un groupe sans inscription payée</td>
<td>Vous</td>
<td>Page du groupe › <span className="ui">Ajouter des apprenants</span>, avec un motif obligatoire, noté dans le journal&nbsp;; l’inscription apparaît dans «&nbsp;Contrôles&nbsp;» jusqu’au paiement (<a href="#q9">Q9</a>).</td>
</tr>
<tr>
<td>Email d’un apprenant ou d’un parent à changer</td>
<td>Vous, sauf compte famille</td>
<td>Fiche › <span className="ui">Modifier</span> (<a href="#q2">Q2</a>). Si un compte famille (actif ou invitation en attente) utilise l’ancienne adresse, la plateforme refuse&nbsp;: <b>la direction</b> s’en charge.</td>
</tr>
<tr>
<td>Supprimer ou archiver un apprenant, supprimer un groupe, importer ou exporter les apprenants</td>
<td><b>La direction</b></td>
<td>Réservé aux responsables.</td>
</tr>
<tr>
<td>Ajouter un enseignant</td>
<td>Vous</td>
<td><span className="menu">Enseignants</span> › <span className="ui">Ajouter</span> (<a href="#q12">Q12</a>)&nbsp;; la direction complète le contrat et la rémunération.</td>
</tr>
<tr>
<td>Archiver un enseignant, ou changer l’email d’un enseignant qui a un compte</td>
<td><b>La direction</b></td>
<td>Réservé aux responsables (<a href="#q12">Q12</a>).</td>
</tr>
<tr>
<td>Test de niveau à annuler</td>
<td>Personne pour l’instant</td>
<td>La plateforme ne gère pas l’annulation. Reprogrammez ou saisissez le résultat.</td>
</tr>
</tbody>
</table>
</div>
<p>Sur la fiche d’un apprenant, la plateforme le rappelle&nbsp;: «&nbsp;Pour corriger ou annuler un reçu, contactez la direction.&nbsp;»</p>
</article>
</section>
<section className="part" id="ecrans">
<header>
<h2>Écran par écran</h2>
<p>Chaque écran de votre menu, en quelques lignes&nbsp;: à quoi il sert, les boutons qui comptent et les pièges.</p>
</header>
<h3>Partie 1 · Prospects (CRM)</h3>
<div className="cols">
<div className="card">
<h4>Opportunités</h4>
<p>Page «&nbsp;Opportunités&nbsp;». Vue <span className="ui">Tableau</span> (colonnes) ou <span className="ui">Liste</span>. Quatre onglets&nbsp;: <b>Tous, Mes prospects, À prendre, Clôturés</b>. Dans <span className="ui">Filtres</span> › <span className="ui">Vue</span>&nbsp;: <b>Arrivés aujourd’hui, Tests de niveau, Sans réponse</b>. Sous «&nbsp;À prendre&nbsp;», la liste se lit étape par étape (Nouveau, Contact en cours, En discussion, Qualifié).</p>
<ul className="tight">
<li>Recherche par nom du parent, de l’apprenant ou téléphone.</li>
<li>Filtres&nbsp;: responsable, canal, source, programme (et statut en liste).</li>
<li>Les filtres restent dans l’adresse&nbsp;: le bouton retour du navigateur ramène à la même liste.</li>
<li>25 prospects par page ou par colonne.</li>
</ul>
</div>
<div className="card">
<h4>Tâches</h4>
<p>Une ligne par contact dans chaque onglet&nbsp;: sa prochaine action. Les autres apprenants du même contact sont listés sur la ligne («&nbsp;Aussi&nbsp;: …&nbsp;»), chacun avec sa propre prochaine action&nbsp;; si l’action d’un frère ou d’une sœur tombe dans un autre onglet, il y a aussi sa propre ligne. Cinq onglets (<b>En retard, Aujourd’hui, Demain, À venir, En attente</b>), heure de Casablanca. Se met à jour chaque minute.</p>
<ul className="tight">
<li>Trois onglets&nbsp;: «&nbsp;Mes prospects&nbsp;» (par défaut), «&nbsp;À prendre&nbsp;», «&nbsp;Toute l’équipe&nbsp;». Chaque action est soit dans les «&nbsp;Mes prospects&nbsp;» de quelqu’un, soit dans «&nbsp;À prendre&nbsp;».</li>
<li><span className="ui">Pas de réponse</span> (appels, un clic), <span className="ui">Noter un échange</span>, <span className="ui">Changer</span>, et les quatre résultats d’un rendez-vous au centre.</li>
<li>«&nbsp;En attente&nbsp;» n’est jamais en retard&nbsp;; «&nbsp;À relancer&nbsp;» s’affiche quand la date de relance est arrivée.</li>
<li>Plusieurs apprenants pour un même contact&nbsp;: la ligne l’indique («&nbsp;2 apprenants&nbsp;»).</li>
<li>«&nbsp;Hors des nouveaux horaires&nbsp;»&nbsp;: après un changement d’horaires, les rendez-vous et rappels convenus qui tombent en dehors des nouveaux horaires sont listés en haut de la page. Leur heure est gardée&nbsp;; appelez le contact et utilisez <span className="ui">Changer</span> si besoin.</li>
</ul>
</div>
<div className="card">
<h4>Tests de niveau</h4>
<p>Liste de tous les tests&nbsp;: apprenant, date, heure, examinateur, score, niveau, statut (<b>Planifié, Passé, Résultat saisi, Affecté</b>, et <b>Annulé</b> ou <b>Absent</b> pour un rendez-vous annulé ou manqué&nbsp;; un test de prospect qui a quitté «&nbsp;Planifié&nbsp;» (annulé, absent ou passé) n’y revient jamais&nbsp;: fixez un nouveau rendez-vous). Les tests liés à un prospect portent l’étiquette «&nbsp;Prospect CRM&nbsp;».</p>
<ul className="tight">
<li>Pas de suppression pour vous.</li>
<li><span className="ui">Planifier un test</span>&nbsp;: choisissez la personne. Un apprenant a un seul test «&nbsp;Planifié&nbsp;» à la fois, sans niveau d’avance. Un prospect est renvoyé à sa fiche (son test se réserve avec son rendez-vous).</li>
<li>Le test d’un apprenant&nbsp;: <span className="ui">Déplacer</span> avant l’heure, <span className="ui">Annuler le test</span> avec un motif, puis, une fois l’heure passée, <span className="ui">Résultat</span> (niveaux de son programme et de son âge) ou <span className="ui">Absent</span>.</li>
</ul>
</div>
<div className="card">
<h4>Calendrier</h4>
<p>Rendez-vous au centre ouverts et tests «&nbsp;Planifié&nbsp;», jour par jour&nbsp;; un rendez-vous avec test n’apparaît qu’une fois. Le résultat d’un rendez-vous se note depuis sa ligne. Pas de glisser-déposer, pas de création depuis le calendrier.</p>
</div>
</div>
<h3>Partie 2 · Au quotidien</h3>
<div className="cols">
<div className="card">
<h4>Inscriptions</h4>
<p>Voir <a href="#q7">Q7</a>. Il n’y a plus de page d’inscriptions à part&nbsp;: on inscrit depuis la fiche de l’apprenant ou depuis un prospect, toujours avec un paiement.</p>
<ul className="tight">
<li>Fiche › <span className="ui">Inscrire et encaisser</span>&nbsp;: inscription et paiement en une fois.</li>
<li>Les inscriptions payées sans groupe&nbsp;: Apprenants, filtre «&nbsp;Groupe à affecter&nbsp;».</li>
</ul>
</div>
<div className="card">
<h4>Vue Cartes</h4>
<p>Voir <a href="#q1">Q1</a>. La Liste des apprenants en cartes (bouton <span className="ui">Cartes</span>, en haut de la liste)&nbsp;: mêmes filtres et même recherche (nom, email, téléphone) que le Tableau. L’ancien menu «&nbsp;Annuaire&nbsp;» y mène.</p>
</div>
<div className="card">
<h4>Liste des apprenants</h4>
<p>L’écran de travail, vue <span className="ui">Tableau</span>&nbsp;: statut du dossier (<b>Inscrit</b>, Sans inscription, Ancien apprenant, Inactif), paiement (Soldé, Acompte versé, En attente, En retard, Aucun engagement), groupe, niveau. 20 apprenants par page.</p>
<ul className="tight">
<li>Colonne <b>Groupe</b>&nbsp;: le groupe, ou le lien <span className="ui">Groupe à affecter</span> pour une inscription payée sans groupe. «&nbsp;—&nbsp;» pour un dossier Sans inscription, un Ancien apprenant ou un Inactif sans inscription en cours&nbsp;: pour l’inscrire, fiche › <span className="ui">Inscrire et encaisser</span>.</li>
<li>La recherche trouve le nom, l’email et le téléphone, dans tous les formats.</li>
<li>La catégorie d’âge se change dans la fiche (<span className="ui">Modifier</span>)&nbsp;: elle doit correspondre au programme (pas de catégorie Adultes dans un programme pour enfants).</li>
<li>Pas d’import, d’export ni d’archivage.</li>
</ul>
</div>
<div className="card">
<h4>Ajouter un apprenant</h4>
<p>Seul le <span className="ui">Nom complet</span> est obligatoire. L’apprenant est créé tout de suite avec le statut «&nbsp;Prospect&nbsp;», <b>sans inscription ni groupe</b>. Il devient «&nbsp;Inscrit&nbsp;» dès qu’une inscription est payée&nbsp;: tout montant supérieur à zéro (<a href="#regles-paiement">règles de paiement</a>).</p>
<ul className="tight">
<li>Aucune détection de doublon&nbsp;: cherchez-le avant.</li>
<li>Après une erreur, un nouvel envoi peut créer un second apprenant&nbsp;: vérifiez la liste avant de recommencer.</li>
</ul>
</div>
<div className="card">
<h4>Fiche apprenant</h4>
<p>Niveau, taux de présence, solde actuel, situation des paiements, informations, inscriptions et groupes (avec <span className="ui">Ajouter un document</span>, 10 Mo, JPEG, PNG ou PDF), adultes autorisés au retrait, paiements historiques, notes.</p>
<ul className="tight">
<li>Les emails de l’apprenant et du parent se modifient tant qu’aucun compte famille ne les utilise (<a href="#q2">Q2</a>)&nbsp;; chaque changement est noté dans l’historique.</li>
<li>Pas de bouton Archiver. «&nbsp;Ancien apprenant&nbsp;» termine un parcours avec un motif&nbsp;; «&nbsp;Rouvrir l’inscription&nbsp;» annule une fin par erreur.</li>
<li>Une inscription <b>Terminée</b> affiche son motif, sa date et son ancien groupe. Elle ne se modifie plus&nbsp;: pour un retour, <span className="ui">Inscrire et encaisser</span>.</li>
</ul>
</div>
<div className="card">
<h4>Groupes &amp; niveaux</h4>
<p>Liste des groupes (programme, niveau, dates du cours, enseignant, horaire, salle, terme). Le filtre de vue montre <span className="ui">En cours</span> par défaut, ou <span className="ui">Clôturés</span>. Vous pouvez créer et modifier un groupe, pas le supprimer. Un groupe a besoin d’un enseignant et d’une année scolaire, et un programme court de ses dates (<a href="#q8">Q8</a>)&nbsp;; sa page affiche l’année et les dates.</p>
<p>Page d’un groupe&nbsp;: <span className="ui">Ajouter des apprenants</span> et <span className="ui">Retirer</span> (<a href="#q10">Q10</a>). Un cours clôturé affiche «&nbsp;Cours clôturé le …&nbsp;», n’a plus ces boutons et montre la liste <b>Anciens apprenants du cours</b>.</p>
<figure className="fig" style={{ marginBottom: '10px' }}>
<Image src="/helpdesk/s17-groups.jpg" width={1700} height={1075} alt="Liste des groupes et niveaux en vue En cours, avec la colonne Dates et un cours marqué terminé" unoptimized tabIndex={0} role="button" /></figure>
</div>
<div className="card">
<h4>Présences</h4>
<p>Voir <a href="#q11">scénario Q11</a>. Vous pouvez saisir pour n’importe quel groupe.</p>
</div>
<div className="card">
<h4>Emploi du temps</h4>
<p>Voir <a href="#q13">Q13</a>. Grille de la semaine, en lecture seule. Un groupe apparaît les jours écrits dans son champ «&nbsp;Jours&nbsp;» (Lun, Mar, Mer…). Pour changer un horaire, modifiez le groupe.</p>
</div>
<div className="card">
<h4>Notes &amp; bulletins</h4>
<p>Tableau des évaluations&nbsp;: apprenant, terme, oral, écrit, finale. <span className="ui">Nouvelle note</span> pour saisir, l’icône de modification pour corriger, <span className="ui">Bulletin</span> pour imprimer le bulletin d’un terme. La suppression d’une note et l’export CSV restent à la direction.</p>
</div>
<div className="card">
<h4>Nouveau reçu</h4>
<p>Page «&nbsp;Encaisser un paiement&nbsp;» en trois étapes&nbsp;: apprenant, solde existant ou nouvelle session, paiement. Voir les <a href="#c6">scénarios C6</a>, <a href="#q3">Q3</a> et <a href="#q4">Q4</a>.</p>
</div>
<div className="card">
<h4>Tous les reçus</h4>
<p>Page «&nbsp;Reçus de paiement&nbsp;», du plus récent au plus ancien, 25 par page. Recherche par nom ou numéro de reçu. Cochez des reçus puis <span className="ui">PDF (N)</span> pour les télécharger ensemble (<a href="#q6">Q6</a>). Le bouton <span className="ui">Encaisser</span> ouvre le formulaire.</p>
<ul className="tight">
<li>Un reçu annulé est marqué «&nbsp;Annulé&nbsp;».</li>
<li>Sur un reçu&nbsp;: <span className="ui">PDF A5</span>, <span className="ui">Imprimer A5</span> et, si l’envoi par email a échoué, <span className="ui">Réessayer l’email</span>.</li>
<li>La note de paiement s’affiche sur le reçu («&nbsp;Note&nbsp;: …&nbsp;»). Le motif d’une annulation reste à la direction.</li>
</ul>
<figure className="fig" style={{ marginBottom: '10px' }}>
<Image src="/helpdesk/s11a-receipts-list.jpg" width={1700} height={1075} alt="Liste des reçus de paiement" unoptimized tabIndex={0} role="button" /></figure>
</div>
<div className="card">
<h4>Enseignants</h4>
<p>Liste, profil, ajout (<span className="ui">Ajouter</span>) et modification&nbsp;: nom, téléphone, email (sauf si l’enseignant a un compte ou une invitation en attente), niveaux autorisés, certifications, notes et photo. Aucun salaire ni contrat (<a href="#q12">Q12</a>).</p>
</div>
<div className="card">
<h4>Mon compte</h4>
<p>Votre email (non modifiable), <span className="ui">Nom</span> et <span className="ui">Téléphone</span>. Pas de changement de mot de passe.</p>
<figure className="fig" style={{ marginBottom: '10px' }}>
<Image src="/helpdesk/s16-account.jpg" width={1700} height={1075} alt="Page Mon compte" unoptimized tabIndex={0} role="button" /></figure>
</div>
</div>
</section>
<section className="part" id="comprendre">
<header>
<h2>Comprendre les statuts et les mots</h2>
</header>
<h3>Prospect, étape, prochaine action, historique</h3>
<div className="scroll">
<table>
<thead>
<tr>
<th>Mot</th>
<th>Ce que c’est</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>Étape</b></td>
<td>Où en est le prospect, commercialement. Elle est calculée par la plateforme à partir de ce que vous enregistrez.</td>
</tr>
<tr>
<td><b>Prochaine action</b></td>
<td>Ce qu’il faut faire ensuite, et quand. Un prospect en cours en a toujours une seule&nbsp;; <span className="ui">Noter un échange</span> ou <span className="ui">Changer</span> la remplacent. La page <span className="menu">Tâches</span> en montre une par ligne.</td>
</tr>
<tr>
<td><b>Historique</b></td>
<td>Ce qui s’est réellement passé, conservé en bas de la fiche. On ne l’efface pas.</td>
</tr>
<tr>
<td><b>Note</b></td>
<td>Un contexte pour l’équipe. Elle ne remplace ni un résultat d’échange ni une prochaine action.</td>
</tr>
</tbody>
</table>
</div>
<h3>Les étapes d’un prospect</h3>
<div className="scroll">
<table>
<thead>
<tr>
<th>Étape</th>
<th>Signification</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="st st-new">Nouveau</span></td>
<td>Pas encore contacté.</td>
</tr>
<tr>
<td><span className="st st-cont">Contact en cours</span></td>
<td>Appels sans réponse pour l’instant (ou prospect rouvert sans conversation).</td>
</tr>
<tr>
<td><span className="st st-eng">En discussion</span></td>
<td>Une vraie conversation a eu lieu&nbsp;: le contact réfléchit, attend quelque chose de nous, ou veut être rappelé.</td>
</tr>
<tr>
<td><span className="st st-qual">Qualifié</span></td>
<td>Le projet est confirmé&nbsp;: rendez-vous au centre (avec ou sans test) ou inscription à finaliser.</td>
</tr>
<tr>
<td><span className="st st-conv">Inscription confirmée</span></td>
<td>Une inscription payée et confirmée est liée au prospect.</td>
</tr>
<tr>
<td><span className="st st-lost">Perdu</span> · <span className="st st-nq">Non qualifié</span></td>
<td>Clôturé, avec un motif.</td>
</tr>
</tbody>
</table>
</div>
<h3>Le chemin d’une inscription</h3>
<ol className="flow">
<li><b>Inscrire et encaisser</b><small>inscription et paiement, en une fois</small></li>
<li><b>Inscrit — groupe à affecter</b><small>payé, pas encore de groupe</small></li>
<li><b>Inscription validée</b><small>groupe affecté</small></li>
</ol>
<p>Une inscription n’existe qu’une fois payée&nbsp;: tout paiement supérieur à zéro la confirme, une remise de 100&nbsp;% avec un motif aussi (inscription gratuite). Le reste à payer est suivi comme avant («&nbsp;Acompte versé&nbsp;», «&nbsp;En retard&nbsp;»).</p>
<p>Anciens statuts retirés, encore visibles sur d’anciennes fiches&nbsp;: «&nbsp;Soumise&nbsp;», «&nbsp;En cours d’examen&nbsp;», «&nbsp;Essai&nbsp;» et «&nbsp;Refusée&nbsp;». Ils restent dans l’historique&nbsp;; plus personne ne peut en créer.</p>
<p><b>Terminée</b>&nbsp;: une inscription finie (fin de parcours, départ, clôture de l’année, d’un cours terminé ou d’un cours en ligne). Elle garde son motif, sa date de fin et le groupe qu’elle a quitté, et reste dans l’historique de la fiche. L’apprenant sort du groupe&nbsp;; ses présences d’avant la date de fin restent. Vous ne la modifiez pas&nbsp;; <span className="ui">Rouvrir l’inscription</span> la rouvre si elle a été terminée par erreur. Si la personne revient&nbsp;: sa fiche › <span className="ui">Inscrire et encaisser</span> (<a href="#q7">Q7</a>).</p>
<h3>Le statut du dossier d’un apprenant</h3>
<p>Il est calculé par la plateforme à partir des inscriptions&nbsp;: vous ne le choisissez pas.</p>
<div className="scroll">
<table>
<thead>
<tr>
<th>Statut</th>
<th>Signification</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>Sans inscription</b></td>
<td>Dossier sans inscription payée&nbsp;: nouveau dossier, ou personne qui n’a pas encore payé. Rien n’est réservé tant qu’il n’y a pas de paiement.</td>
</tr>
<tr>
<td><b>Inscrit</b></td>
<td>Au moins une inscription confirmée («&nbsp;Inscrit — groupe à affecter&nbsp;») ou validée.</td>
</tr>
<tr>
<td><b>Ancien apprenant</b></td>
<td>A terminé son programme&nbsp;: ses inscriptions ont été terminées avec «&nbsp;Ancien apprenant&nbsp;». Il n’est plus dans aucun groupe. Son solde éventuel reste dû, ses reçus et présences ne changent pas.</td>
</tr>
<tr>
<td><b>Inactif</b></td>
<td>A arrêté en cours de route (même commande).</td>
</tr>
</tbody>
</table>
</div>
<p>La clôture de l’année scolaire, d’un cours terminé ou d’un cours en ligne, faite par la direction, termine aussi des inscriptions et peut donner ces deux derniers statuts.</p>
<p>Un Ancien apprenant ou un Inactif n’apparaît pas dans la liste par défaut (choisissez <span className="ui">Tous les statuts</span>) et sa colonne Groupe affiche «&nbsp;—&nbsp;». Pour une réinscription&nbsp;: sa fiche › <span className="ui">Inscrire et encaisser</span> (<a href="#q7">Q7</a>).</p>
<h3>Glossaire des mots anglais</h3>
<p>Quelques mots restent en anglais dans la plateforme. Voici leur sens.</p>
<div className="scroll">
<table>
<thead>
<tr>
<th>À l’écran</th>
<th>En français</th>
</tr>
</thead>
<tbody>
<tr>
<td>Submitted</td>
<td>Soumise (ancien statut retiré)</td>
</tr>
<tr>
<td>Under Review</td>
<td>En cours d’examen (ancien statut retiré)</td>
</tr>
<tr>
<td>Trial</td>
<td>Essai (ancien statut retiré)</td>
</tr>
<tr>
<td>Confirmed</td>
<td>Inscrit — groupe à affecter</td>
</tr>
<tr>
<td>Validated</td>
<td>Inscription validée</td>
</tr>
<tr>
<td>Rejected</td>
<td>Refusée (ancien statut retiré)</td>
</tr>
<tr>
<td>Ended</td>
<td>Terminée</td>
</tr>
<tr>
<td>Enrolled · Prospect · Inactive · Alumni</td>
<td>Inscrit · Prospect · Inactif · Ancien apprenant</td>
</tr>
<tr>
<td>Yearly</td>
<td>Programme annuel</td>
</tr>
<tr>
<td>Adults, Summer Camp, Communication Junior / Adult, One-to-One, Mise à niveau, Other</td>
<td>Adultes, Stage d’été, Communication junior / adultes, Cours individuel, Mise à niveau, Autre</td>
</tr>
<tr>
<td>Pre-Child, Child 1–6, Junior 1–6, Beginning / Intermediate / Advanced</td>
<td>Noms des niveaux&nbsp;: ils restent tels quels</td>
</tr>
</tbody>
</table>
</div>
</section>
<section className="part" id="coince">
<header>
<h2>Quand ça coince</h2>
</header>
<h3>Messages que vous pouvez rencontrer</h3>
<div className="scroll">
<table>
<thead>
<tr>
<th>Message</th>
<th>Que faire</th>
</tr>
</thead>
<tbody>
<tr>
<td>«&nbsp;Ce prospect a été modifié, rechargez.&nbsp;» ou «&nbsp;Ce prospect a changé depuis son ouverture…&nbsp;»</td>
<td>Quelqu’un d’autre a modifié la fiche. Votre saisie est gardée&nbsp;: <span className="ui">Recharger</span>, vérifiez la nouvelle action, puis refaites votre enregistrement.</td>
</tr>
<tr>
<td>«&nbsp;Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.&nbsp;»</td>
<td>La connexion a coupé. Cliquez à nouveau sur <span className="ui">Enregistrer</span> sans rien changer.</td>
</tr>
<tr>
<td>«&nbsp;Cette heure est hors des horaires d’appel.&nbsp;» ou «&nbsp;…hors des horaires d’ouverture du centre.&nbsp;»</td>
<td>Choisissez un créneau proposé dans la liste <span className="ui">Heure</span>, avec le contact.</td>
</tr>
<tr>
<td>«&nbsp;Le délai minimum entre deux appels n’est pas écoulé…&nbsp;»</td>
<td>Si l’appel a bien eu lieu, cochez <span className="ui">Tentative réelle (hors délai)</span>. Sinon, attendez l’heure «&nbsp;Prochain essai possible à…&nbsp;».</td>
</tr>
<tr>
<td>«&nbsp;Cochez «&nbsp;Remplace&nbsp;» pour changer le rendez-vous.&nbsp;»</td>
<td>Un rendez-vous est déjà prévu. Cochez <span className="ui">Remplace le rendez-vous</span> si c’est voulu, sinon <span className="ui">Garder l’action actuelle</span>.</td>
</tr>
<tr>
<td>«&nbsp;Le résultat du rendez-vous se saisit à partir de son heure de début.&nbsp;»</td>
<td>Attendez l’heure du rendez-vous pour noter s’il est venu.</td>
</tr>
<tr>
<td>«&nbsp;Le calendrier de suivi n’est pas encore configuré. Demandez à un directeur de le publier.&nbsp;»</td>
<td>Prévenez la direction&nbsp;: sans horaires du centre publiés, on ne peut pas créer de prospect.</td>
</tr>
<tr>
<td>«&nbsp;Cinq appels sans réponse dans la séquence actuelle sont nécessaires.&nbsp;»</td>
<td>Vous essayez de clôturer comme injoignable trop tôt. Continuez les appels.</td>
</tr>
<tr>
<td>«&nbsp;Un test est déjà prévu. Ouvrez-le pour le reprogrammer.&nbsp;»</td>
<td><span className="ui">Changer</span> › <span className="ui">Remplace le rendez-vous</span> (<a href="#c5">C5</a>), ou fiche › Test de niveau › <span className="ui">Reprogrammer</span>.</td>
</tr>
<tr>
<td>«&nbsp;Le paiement dépasse le solde de … MAD.&nbsp;»</td>
<td>Saisissez un montant égal ou inférieur au solde.</td>
</tr>
<tr>
<td>«&nbsp;Choisissez une inscription existante ou créez-en une distincte.&nbsp;» ou «&nbsp;Sélectionnez l’inscription CRM existante…&nbsp;»</td>
<td>Dans <span className="ui">Inscription à rattacher</span>, choisissez l’inscription déjà créée pour cette session et cette année.</td>
</tr>
<tr>
<td>«&nbsp;Ce paiement a peut-être déjà été enregistré…&nbsp;»</td>
<td>Ne ressaisissez pas. Ouvrez les reçus de l’apprenant et vérifiez.</td>
</tr>
<tr>
<td>«&nbsp;Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.&nbsp;»</td>
<td>Rechargez la page et recommencez.</td>
</tr>
<tr>
<td>Un message en anglais&nbsp;: «&nbsp;Student unavailable or stale&nbsp;», «&nbsp;Enrollment unavailable or stale&nbsp;», «&nbsp;Teacher unavailable or stale&nbsp;»</td>
<td>Quelqu’un a modifié la même fiche en même temps. Rechargez la page et refaites la modification.</td>
</tr>
<tr>
<td>«&nbsp;Select an enrollment explicitly&nbsp;»</td>
<td>Vous avez essayé d’ajouter à un groupe, depuis la page du groupe, quelqu’un qui en a déjà un. Ouvrez sa fiche › <span className="ui">Modifier l’inscription</span> (<a href="#q10">Q10</a>).</td>
</tr>
<tr>
<td>«&nbsp;Indiquez le motif de la remise.&nbsp;» ou «&nbsp;Précisez le motif de la remise «&nbsp;Autre&nbsp;».&nbsp;»</td>
<td>Choisissez le <span className="ui">Motif de la remise</span>&nbsp;; avec «&nbsp;Autre&nbsp;», écrivez quelques mots (<a href="#regles-paiement">règles de paiement</a>).</td>
</tr>
<tr>
<td>«&nbsp;La date du paiement ne peut pas être dans le futur…&nbsp;» ou «&nbsp;… antérieure de plus de 7 jours.&nbsp;»</td>
<td>Mettez la date réelle du paiement, entre aujourd’hui et 7 jours en arrière. Plus ancien&nbsp;: demandez à la direction.</td>
</tr>
<tr>
<td>«&nbsp;L’inscription se confirme à l’encaissement&nbsp;: saisissez un paiement.&nbsp;»</td>
<td>Saisissez un montant supérieur à zéro (ou une remise de 100&nbsp;% avec son motif). Rien n’a été créé.</td>
</tr>
<tr>
<td>«&nbsp;Inscrivez et encaissez d’abord&nbsp;: l’affectation suit une inscription payée.&nbsp;»</td>
<td>L’apprenant n’a pas d’inscription payée pour ce programme et cette année&nbsp;: <span className="ui">Inscrire et encaisser</span> depuis sa fiche (<a href="#q7">Q7</a>), avec le groupe.</td>
</tr>
<tr>
<td>«&nbsp;Paiement enregistré. Groupe non affecté&nbsp;: …&nbsp;»</td>
<td>Le paiement et l’inscription sont enregistrés&nbsp;; seul le groupe manque (complet, par exemple). Affectez-en un autre (<a href="#q9">Q9</a>).</td>
</tr>
<tr>
<td>«&nbsp;L’année scolaire de l’inscription (…) ne correspond pas à celle du groupe (…).&nbsp;» ou, dans le CRM, «&nbsp;L’année scolaire de l’inscription doit être celle du groupe…&nbsp;»</td>
<td>Choisissez un groupe de la même année scolaire que l’inscription, ou créez-le (<a href="#q9">Q9</a>, <a href="#c6">C6</a>).</td>
</tr>
<tr>
<td>«&nbsp;Réaffectez les apprenants avant de changer l’année scolaire du groupe.&nbsp;»</td>
<td>Le groupe a des apprenants d’une autre année que celle saisie. Gardez son année, ou créez un nouveau groupe (<a href="#q8">Q8</a>).</td>
</tr>
<tr>
<td>«&nbsp;Année scolaire invalide&nbsp;: utilisez le format 2026/2027 (deux années consécutives).&nbsp;»</td>
<td>Écrivez l’année avec une barre et deux années qui se suivent, par exemple 2026/2027.</td>
</tr>
<tr>
<td>«&nbsp;Renseignez l’année scolaire du groupe.&nbsp;»</td>
<td>Le groupe n’a pas d’année. Choisissez un autre groupe, ou ouvrez le groupe et renseignez son année (<a href="#q8">Q8</a>).</td>
</tr>
<tr>
<td>L’écran «&nbsp;Connexion impossible&nbsp;»</td>
<td><span className="ui">Réessayer</span>, puis si besoin <span className="ui">Se déconnecter</span> et reconnectez-vous (<a href="#connexion-impossible">détail</a>).</td>
</tr>
<tr>
<td>«&nbsp;Forbidden&nbsp;»</td>
<td>Vous n’avez pas le droit de faire cette action. Demandez à la direction.</td>
</tr>
<tr>
<td>«&nbsp;Only group assignment is permitted&nbsp;»</td>
<td>Vous essayez de confirmer, valider ou modifier une inscription déjà confirmée. Seule l’affectation de groupe est possible pour vous.</td>
</tr>
</tbody>
</table>
</div>
<h3>Questions fréquentes</h3>
<details className="faq">
<summary>Ma page Tâches est vide, mais je sais qu’il y a du travail</summary>
<p>Par défaut, <span className="menu">Tâches</span> s’ouvre sur <span className="ui">Mes prospects</span>&nbsp;: vos suivis seulement. Regardez <span className="ui">À prendre</span> (personne ne l’a encore pris) ou <span className="ui">Toute l’équipe</span> (il est peut-être chez une collègue), et vérifiez l’onglet <b>En attente</b>.</p>
</details>
<details className="faq">
<summary>Je ne trouve pas un apprenant avec son numéro de téléphone</summary>
<p>Dans <span className="menu">Liste des apprenants</span>, la recherche trouve aussi le téléphone, comme celle de <span className="menu">Nouveau reçu</span> (nom, téléphone, email de l’apprenant ou du parent). Dans <span className="menu">Opportunités</span>, la recherche accepte le téléphone des prospects.</p>
</details>
<details className="faq">
<summary>Un apprenant que je viens de créer n’apparaît pas dans la liste</summary>
<p>La liste affiche par défaut les «&nbsp;Dossiers actifs&nbsp;». Un apprenant reste «&nbsp;Prospect&nbsp;», donc masqué, tant qu’aucune inscription n’est payée, par exemple après un paiement à 0&nbsp;: choisissez <span className="ui">Tous les statuts</span>.</p>
</details>
<details className="faq">
<summary>Le prospect est resté «&nbsp;Qualifié&nbsp;» alors que j’ai encaissé son inscription</summary>
<p>Avec <span className="ui">Inscrire et encaisser</span> depuis sa fiche CRM, il passe aussitôt en «&nbsp;Inscription confirmée&nbsp;» (<a href="#c6">scénario C6</a>). Si vous avez encaissé depuis <span className="menu">Nouveau reçu</span> sans passer par le prospect, l’inscription n’est pas rattachée&nbsp;: ouvrez le prospect, <span className="ui">Inscrire et encaisser</span>, choisissez son apprenant et son inscription payée, puis <span className="ui">Rattacher cette inscription payée</span>.</p>
</details>
<details className="faq">
<summary>Le bouton «&nbsp;Inscrire et encaisser&nbsp;» n’apparaît pas dans la fiche du prospect</summary>
<p>Il n’existe que pour un prospect «&nbsp;Qualifié&nbsp;» sans inscription. La fiche indique la raison en dessous&nbsp;: «&nbsp;Qualifiez le projet avant de commencer une inscription&nbsp;», ou «&nbsp;Rouvrez le prospect…&nbsp;» s’il est clôturé.</p>
</details>
<details className="faq">
<summary>Une carte déposée dans une autre colonne revient à sa place</summary>
<p>Déposer une carte n’enregistre rien&nbsp;: cela ouvre la fenêtre correspondante. L’étape ne change que si vous enregistrez un résultat. Certains déplacements (retour en arrière, vers «&nbsp;Inscription confirmée&nbsp;» sans inscription) ne sont pas pris en charge.</p>
</details>
<details className="faq">
<summary>Je ne trouve pas l’heure que le contact demande</summary>
<p>Les listes <span className="ui">Heure</span> ne proposent que les créneaux des horaires du centre, fixés par la direction&nbsp;: horaires d’appel pour un rappel, horaires d’ouverture pour un rendez-vous, sans la pause de midi ni les jours de fermeture. Proposez au contact un créneau de la liste. «&nbsp;Aucun créneau ce jour-là&nbsp;»&nbsp;: le centre est fermé ce jour-là, choisissez une autre date.</p>
</details>
<details className="faq">
<summary>Je ne peux pas modifier l’email d’un apprenant</summary>
<p>La plateforme refuse quand un compte famille (actif ou invitation en attente) utilise l’ancienne adresse&nbsp;: «&nbsp;Un compte famille utilise cet e-mail&nbsp;: la direction le modifie.&nbsp;» Cette adresse sert à la connexion de la famille&nbsp;: demandez à la direction. Sans compte famille, modifiez-la depuis la fiche › <span className="ui">Modifier</span> (<a href="#q2">Q2</a>).</p>
</details>
<details className="faq">
<summary>Un lien ou une page m’a renvoyée à «&nbsp;Opportunités&nbsp;»</summary>
<p>La page n’est pas dans votre espace. Voir «&nbsp;Ce que vous ne verrez pas&nbsp;» plus haut.</p>
</details>
<details className="faq">
<summary>J’ai encaissé, mais l’apprenant n’est pas «&nbsp;Inscrit&nbsp;» et le prospect reste «&nbsp;Qualifié&nbsp;»</summary>
<p>Le paiement était probablement de 0 (engagement seul, sans inscription), ou il a été encaissé depuis <span className="menu">Nouveau reçu</span> sans passer par le prospect. Dans le premier cas, encaissez un montant supérieur à zéro. Dans le second, ouvrez le prospect › <span className="ui">Inscrire et encaisser</span> et rattachez son inscription payée (<a href="#c6">C6</a>).</p>
</details>
<details className="faq">
<summary>Je ne trouve pas le bon groupe dans «&nbsp;Affecter un groupe&nbsp;»</summary>
<p>La liste ne propose que les groupes du même programme, du même niveau et de la même année scolaire que l’inscription. Vérifiez l’année du groupe sur sa page&nbsp;; s’il manque un groupe pour cette année, créez-le (<a href="#q8">Q8</a>).</p>
</details>
<details className="faq">
<summary>Un apprenant affiche «&nbsp;—&nbsp;» dans la colonne Groupe</summary>
<p>Son dossier est Prospect, Ancien apprenant ou Inactif, sans inscription en cours&nbsp;: il n’y a pas de groupe à affecter. Pour l’inscrire, ouvrez sa fiche › <span className="ui">Inscrire et encaisser</span>.</p>
</details>
</section>
<section className="part" id="direction">
<header>
<h2>Réservé à la direction</h2>
<p>Ce que vous ne pouvez pas faire dans votre espace, et que vous devez demander.</p>
</header>
<div className="scroll">
<table>
<thead>
<tr>
<th>Domaine</th>
<th>Réservé à la direction</th>
</tr>
</thead>
<tbody>
<tr>
<td>Finance</td>
<td>Annuler un paiement ou un engagement, supprimer un reçu, voir le tableau de bord financier et la paie.</td>
</tr>
<tr>
<td>Inscriptions</td>
<td>Confirmer, valider, refuser ou supprimer une inscription. Changer le lien entre un prospect et un apprenant.</td>
</tr>
<tr>
<td>Apprenants</td>
<td>Archiver, importer, exporter. Changer un email qu’un compte famille utilise.</td>
</tr>
<tr>
<td>Académique</td>
<td>Supprimer un groupe, clôturer un cours terminé ou le rouvrir, clôturer l’année scolaire, supprimer une note, exporter les notes (CSV).</td>
</tr>
<tr>
<td>Enseignants</td>
<td>Contrats, salaires, décision sur les congés, archivage d’un enseignant, email d’un enseignant qui a un compte ou une invitation en attente.</td>
</tr>
<tr>
<td>Prospects</td>
<td>Horaires du centre (<span className="menu">Paramètres</span> › <span className="ui">Horaires du centre</span>&nbsp;: plages d’appel et jours de fermeture), responsable par défaut des nouveaux prospects (Meta, site), analyse marketing, suivi Meta.</td>
</tr>
<tr>
<td>Comptes</td>
<td>Création des utilisateurs et rôles, paramètres du centre.</td>
</tr>
</tbody>
</table>
</div>
</section>
<section className="part" id="memo">
<header>
<h2>Aide-mémoire</h2>
<p>L’essentiel sur une page.</p>
</header>
<div className="cols">
<div className="card mini">
<h4>Un prospect</h4>
<ul className="tight">
<li>Chercher avant d’ajouter.</li>
<li>Une seule prochaine action, toujours.</li>
<li>Pas de réponse&nbsp;: un clic, la plateforme planifie la suite (5 appels).</li>
<li>On a parlé&nbsp;: <span className="ui">Noter un échange</span>, ce qui a été convenu.</li>
<li>Ce qui était prévu change&nbsp;: <span className="ui">Changer</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Rendez-vous et test</h4>
<ul className="tight">
<li><span className="ui">Rendez-vous au centre</span>, <span className="ui">Avec test de niveau</span> si besoin.</li>
<li>Heure&nbsp;: un créneau proposé.</li>
<li>À l’heure&nbsp;: <span className="ui">Venu · s’inscrit</span>, <span className="ui">Venu · reviendra</span>, <span className="ui">Venu · pas intéressé</span> ou <span className="ui">Absent</span>.</li>
<li>Déplacer ou annuler&nbsp;: <span className="ui">Changer</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Inscrire</h4>
<ul className="tight">
<li><span className="ui">Inscrire et encaisser</span>&nbsp;: apprenant, inscription, paiement en une fois.</li>
<li>Tout paiement supérieur à zéro confirme&nbsp;; le prospect est converti aussitôt.</li>
<li>Remise de 100&nbsp;% avec motif&nbsp;: inscription gratuite, sans reçu.</li>
<li>Ensuite&nbsp;: <span className="ui">Groupe à affecter</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Au guichet</h4>
<ul className="tight">
<li><span className="menu">Nouveau reçu</span> › <span className="ui">Nouvel apprenant</span>.</li>
<li>Regarder «&nbsp;Dossiers ressemblants&nbsp;».</li>
<li>Montant 0 = pas de reçu, pas d’inscription.</li>
<li>Remise&nbsp;: toujours un motif. Date&nbsp;: pas dans le futur, 7 jours en arrière au plus.</li>
<li>Un reçu ne se modifie pas&nbsp;: direction.</li>
</ul>
</div>
<div className="card mini">
<h4>Un apprenant</h4>
<ul className="tight">
<li>Chercher dans la <span className="menu">Liste des apprenants</span>, même par téléphone.</li>
<li>Compléter&nbsp;: fiche › <span className="ui">Modifier</span>, emails compris (sauf compte famille&nbsp;: direction).</li>
<li>Changer de groupe&nbsp;: <span className="ui">Modifier l’inscription</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Groupes et enseignants</h4>
<ul className="tight">
<li><span className="ui">Nouveau groupe</span>&nbsp;: l’enseignant et l’année scolaire sont obligatoires.</li>
<li>Un groupe ne reçoit que les inscriptions de son année.</li>
<li><span className="ui">Jours</span> alimente l’emploi du temps.</li>
<li>Nouvel enseignant&nbsp;: <span className="menu">Enseignants</span> › <span className="ui">Ajouter</span>&nbsp;; contrat et salaire&nbsp;: direction.</li>
</ul>
</div>
<div className="card mini">
<h4>Impayés et reçus</h4>
<ul className="tight">
<li><span className="ui">Filtrer par paiement</span> dans la liste.</li>
<li><span className="menu">Tous les reçus</span>&nbsp;: <span className="ui">PDF (N)</span> pour plusieurs.</li>
<li>Un reçu ne se modifie pas.</li>
</ul>
</div>
<div className="card mini">
<h4>Présences</h4>
<ul className="tight">
<li>Tout le monde est «&nbsp;Présent&nbsp;» par défaut.</li>
<li>Cliquer Absent, Retard ou Justifié.</li>
<li><span className="ui">Enregistrer les présences</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>En cas de doute</h4>
<ul className="tight">
<li>Message «&nbsp;Impossible de confirmer…&nbsp;»&nbsp;: relancer sans rien changer.</li>
<li>Écran «&nbsp;Connexion impossible&nbsp;»&nbsp;: <span className="ui">Réessayer</span>, sinon <span className="ui">Se déconnecter</span>.</li>
<li>Paiement douteux&nbsp;: vérifier les reçus avant de ressaisir.</li>
<li>Page qui renvoie à l’accueil&nbsp;: hors de votre espace.</li>
<li>Sinon&nbsp;: contacter la direction.</li>
</ul>
</div>
</div>
</section>
<footer className="foot"><p>Guide Accueil, version 2.6, 27 novembre 2026. Il décrit la plateforme à cette date. Les captures montrent des données fictives. Signalez à la direction tout écart entre ce guide et l’écran.</p>
<a className="backtop" href="#prise-en-main">Retour en haut</a></footer>
    </>
  );
}
