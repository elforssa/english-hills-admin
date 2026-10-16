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
<li>Version 2.0</li>
<li>16 octobre 2026</li>
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
<li><a href="#c1">C1</a> Un nouveau prospect · <a href="#c2">C2</a> J’appelle · <a href="#c3">C3</a> Le parent a répondu</li>
<li><a href="#c4">C4</a> Test de niveau · <a href="#c5">C5</a> Visite · <a href="#c6">C6</a> Inscrire · <a href="#c7">C7</a> Clôturer</li>
</ul>
</div>
<div className="card">
<h4>Partie 2 · Au quotidien</h4>
<p>Dès que la personne est inscrite, ou se présente au guichet&nbsp;: dossiers, paiements, groupes, présences, enseignants.</p>
<ul className="tight">
<li><a href="#q1">Q1–Q2</a> Apprenants et dossiers · <a href="#q3">Q3–Q7</a> Paiements, reçus, pré-inscriptions</li>
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
<li><p>Cliquez sur <span className="ui">Se connecter</span>. Vous arrivez sur la page <b>Pipeline admissions</b>, votre page d’accueil.</p>
</li>
</ol>
<ul className="tight">
<li>Mot de passe oublié&nbsp;: <span className="ui">Mot de passe oublié&nbsp;?</span> sous le champ du mot de passe.</li>
<li>Autre option&nbsp;: <span className="ui">Connexion par lien magique</span>. Vous recevez un lien par email, valable 1 heure.</li>
<li>Pour quitter&nbsp;: <span className="ui">Déconnexion</span>, en bas du menu de gauche. Il n’y a pas de message de confirmation.</li>
</ul>
<div className="callout warn">
<strong>Pas de changement de mot de passe dans «&nbsp;Mon compte&nbsp;»</strong><p>La page <span className="menu">Mon compte</span> permet de modifier votre nom et votre téléphone seulement. Pour un nouveau mot de passe, passez par <span className="ui">Mot de passe oublié&nbsp;?</span> ou demandez à la direction.</p>
</div>
<h3 id="menu">Votre page d’accueil et votre menu</h3>
<figure className="fig">
<Image src="/helpdesk/s01-board.jpg" width={1700} height={1075} alt="Page Pipeline admissions avec le menu de gauche, les vues, le bouton Ajouter un prospect et cinq colonnes de prospects" unoptimized tabIndex={0} role="button" /><figcaption>La page d’accueil&nbsp;: le tableau des prospects, par étape.</figcaption>
<ol className="legend">
<li>Le menu <span className="menu">CRM</span> contient <span className="menu">Opportunités</span> (cette page) et <span className="menu">Tâches</span>.</li>
<li>Les <b>vues</b>&nbsp;: des filtres prêts à l’emploi (<span className="ui">Mes prospects</span>, <span className="ui">À traiter</span>, <span className="ui">Sans réponse</span>…).</li>
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
<td><span className="menu">Opportunités</span> (page «&nbsp;Pipeline admissions&nbsp;»)<br /><span className="menu">Tâches</span> (page «&nbsp;Tâches · Mon travail&nbsp;»)</td>
<td>Suivre les prospects et vos actions du jour.</td>
</tr>
<tr>
<td><b>Admissions</b></td>
<td><span className="menu">Tests de niveau</span><br /><span className="menu">Calendrier</span> (page «&nbsp;Calendrier admissions&nbsp;»)<br /><span className="menu">Inscriptions</span> (page «&nbsp;Pré-inscriptions&nbsp;»)</td>
<td>Organiser les tests et les visites, suivre les pré-inscriptions.</td>
</tr>
<tr>
<td><b>Apprenants</b></td>
<td><span className="menu">Annuaire</span><br /><span className="menu">Liste des apprenants</span><br /><span className="menu">Ajouter un apprenant</span></td>
<td>Retrouver un apprenant, créer ou compléter un dossier, voir son solde, lui affecter un groupe.</td>
</tr>
<tr>
<td><b>Académique</b></td>
<td><span className="menu">Groupes &amp; niveaux</span><br /><span className="menu">Présences</span><br /><span className="menu">Emploi du temps</span><br /><span className="menu">Notes &amp; bulletins</span></td>
<td>Créer et modifier les groupes, prendre les présences, consulter horaires et notes.</td>
</tr>
<tr>
<td><b>Finance</b></td>
<td><span className="menu">Nouveau reçu</span> (page «&nbsp;Encaisser un paiement&nbsp;»)<br /><span className="menu">Tous les reçus</span> (page «&nbsp;Reçus de paiement&nbsp;»)</td>
<td>Encaisser, imprimer, retrouver, renvoyer un reçu.</td>
</tr>
<tr>
<td><b>Enseignants</b></td>
<td><span className="menu">Liste des enseignants</span></td>
<td>Coordonnées, niveaux et certifications (vous pouvez les modifier). Jamais les salaires.</td>
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
<td>Noter le résultat d’un appel</td>
<td><span className="menu">Tâches</span> ou la fiche du prospect</td>
<td><a href="#c2">Scénario C2</a></td>
</tr>
<tr>
<td>Réserver un test de niveau pour un prospect</td>
<td>Fiche du prospect › <span className="ui">Réserver un test</span></td>
<td><a href="#c4">Scénario C4</a></td>
</tr>
<tr>
<td>Voir les tests et visites de la semaine</td>
<td><span className="menu">Admissions</span> › <span className="menu">Calendrier</span></td>
<td><a href="#c4">Scénario C4</a></td>
</tr>
<tr>
<td>Inscrire un prospect qualifié</td>
<td>Fiche du prospect › <span className="ui">Commencer l&apos;inscription</span></td>
<td><a href="#c6">Scénario C6</a></td>
</tr>
<tr>
<td>Clôturer ou rouvrir un prospect</td>
<td>Fiche du prospect › <span className="ui">Autres actions</span></td>
<td><a href="#c7">Scénario C7</a></td>
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
<td><span className="menu">Apprenants</span> › <span className="menu">Annuaire</span></td>
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
<td>Préparer ou suivre une pré-inscription</td>
<td><span className="menu">Admissions</span> › <span className="menu">Inscriptions</span></td>
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
<td>Pas dans votre espace&nbsp;: à demander à la direction</td>
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
<p>Votre espace est limité aux opérations du quotidien. Ces éléments existent dans la plateforme mais ne sont pas pour vous&nbsp;: le tableau de bord, les rapports, l’analyse marketing, le suivi Meta, le tableau de bord financier, la paie, les congés, les salaires des enseignants, les messages et annonces, la gestion des utilisateurs et les paramètres du centre.</p>
<div className="callout info">
<strong>Une page vous ramène à «&nbsp;Pipeline admissions&nbsp;» sans rien dire&nbsp;?</strong><p>C’est normal. Quand vous ouvrez une adresse qui ne fait pas partie de votre espace (un ancien lien, une page de la direction), la plateforme vous renvoie à votre page d’accueil sans message d’erreur.</p>
</div>
<h3 id="reflexes">Les six réflexes</h3>
<ul className="rules">
<li><b>Ouvrir un appel n’enregistre rien.</b><p>Après chaque appel, enregistrez le résultat. C’est ce qui fait avancer le prospect et planifie la suite.</p>
</li>
<li><b>Chercher avant de créer.</b><p>Avant d’ajouter un prospect ou un apprenant, cherchez-le. La plateforme ne bloque jamais un doublon sur «&nbsp;Ajouter un apprenant&nbsp;».</p>
</li>
<li><b>Un reçu ne se modifie pas.</b><p>En cas d’erreur de montant, de personne ou de prix, la direction annule le paiement. Vous le ressaisissez ensuite.</p>
</li>
<li><b>Un paiement confirme l’inscription.</b><p>Sans paiement (montant 0), l’inscription n’est pas confirmée. Après un paiement, il reste à affecter le groupe.</p>
</li>
<li><b>Après un clic sur Enregistrer, ne recommencez pas.</b><p>Si un message dit «&nbsp;Impossible de confirmer l’enregistrement&nbsp;», relancez <span className="ui">Enregistrer</span> sans rien modifier. Pour un paiement, vérifiez d’abord les reçus de l’apprenant.</p>
</li>
<li><b>Chaque prospect a toujours une prochaine action.</b><p>Quand vous terminez ou annulez une tâche, la plateforme vous demande d’en choisir une nouvelle. Pour arrêter le suivi, il faut clôturer le prospect.</p>
</li>
</ul>
</section>
<section className="part" id="journee">
<header>
<h2>Une journée type</h2>
<p>Une routine simple pour ne rien laisser passer. Pour la rentrée et la fin de mois, voir <a href="#q14">Q14</a>.</p>
</header>
<figure className="fig">
<Image src="/helpdesk/s04-tasks.jpg" width={1700} height={1075} alt="Page Tâches · Mon travail avec les filtres, les onglets En retard, Aujourd’hui, Demain, À venir, et deux tâches" unoptimized tabIndex={0} role="button" /><figcaption>La page <span className="menu">Tâches</span>&nbsp;: votre point de départ chaque matin.</figcaption>
<ol className="legend">
<li><span className="ui">Responsable de la tâche</span>&nbsp;: «&nbsp;Mes tâches&nbsp;» par défaut. Passez à <span className="ui">Non attribué</span> ou <span className="ui">Toute l’équipe</span> pour voir le reste.</li>
<li>Les échéances&nbsp;: <b>En retard</b>, <b>Aujourd’hui</b>, <b>Demain</b>, <b>À venir</b>, avec le nombre de tâches dans chaque onglet.</li>
<li><span className="ui">Résultat d’appel</span>&nbsp;: ouvre la fenêtre pour noter ce qui s’est passé.</li>
<li><span className="ui">À traiter · prospects nécessitant un suivi</span>&nbsp;: les prospects qui risquent d’être oubliés.</li>
</ol>
</figure>
<div className="cols">
<div className="card">
<h4>Le matin</h4>
<ol className="steps">
<li><p>Ouvrez <span className="menu">Tâches</span>. Traitez d’abord <b>En retard</b>, puis <b>Aujourd’hui</b>.</p>
</li>
<li><p>Passez <span className="ui">Responsable de la tâche</span> sur <span className="ui">Non attribué</span>&nbsp;: les prospects ajoutés à la main et les demandes des formulaires y arrivent sans responsable.</p>
</li>
<li><p>Cliquez sur <span className="ui">À traiter · prospects nécessitant un suivi</span> pour repérer les prospects sans prochaine action.</p>
</li>
<li><p>Ouvrez <span className="menu">Admissions</span> › <span className="menu">Calendrier</span> en vue <span className="ui">Jour</span>&nbsp;: tests et visites attendus.</p>
</li>
<li><p>En bas de <span className="menu">Tâches</span>, la section <b>À vérifier</b> apparaît s’il y a des demandes ambiguës à examiner (<a href="#c1">scénario C1</a>).</p>
</li>
</ol>
</div>
<div className="card">
<h4>Pendant la journée</h4>
<ul className="tight">
<li>Notez chaque appel juste après l’avoir passé.</li>
<li>Une personne se présente&nbsp;: <a href="#q3">scénario Q3</a>.</li>
<li>Chaque paiement donne un reçu à imprimer.</li>
<li>Chaque nouvelle inscription payée attend un groupe&nbsp;: <a href="#q9">scénario Q9</a>.</li>
<li>Un parent demande un test ou une visite&nbsp;: <a href="#c4">scénarios C4</a> et <a href="#c5">C5</a>.</li>
<li>Une famille veut un reçu, un solde ou un horaire&nbsp;: <a href="#q6">Q6</a>, <a href="#q5">Q5</a>, <a href="#q13">Q13</a>.</li>
</ul>
</div>
<div className="card">
<h4>Avant de partir</h4>
<ul className="tight">
<li><b>En retard</b> est à 0, ou chaque tâche est replanifiée.</li>
<li>Dans <span className="menu">Liste des apprenants</span>, le filtre <span className="ui">Groupe à affecter</span> ne renvoie plus personne.</li>
<li>Les présences des groupes du jour sont enregistrées.</li>
<li>Aucun prospect du jour n’est resté sans prochaine action.</li>
</ul>
</div>
</div>
</section>
<section className="part" id="crm">
<header>
<h2>Partie 1 · Prospects (CRM)</h2>
<p>Un prospect est une personne qui n’est pas encore inscrite. Vous la suivez, étape par étape, jusqu’à son inscription payée&nbsp;: C1 à C7 suivent cette vie. Une fois le paiement enregistré, tout continue dans la <a href="#quotidien">partie 2</a>.</p>
</header>
<article className="scn" id="c1">
<header className="scn-head">
<p className="kicker">Scénario C1</p>
<h3>Un nouveau prospect arrive</h3>
<p className="when">Une demande est reçue par un formulaire, ou une personne appelle ou passe sans formulaire.</p>
</header>
<h4>Cas A&nbsp;: la demande vient d’un formulaire (Meta, site web)</h4>
<p>Le prospect apparaît tout seul dans la colonne <span className="st st-new">Nouveau</span>, avec une tâche <b>Premier contact</b>. Rien à saisir&nbsp;: appelez-le (<a href="#c2">scénario C2</a>).</p>
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
<li><p><b>Cherchez d’abord.</b> Dans <span className="menu">Opportunités</span>, tapez le nom du parent, de l’apprenant ou le téléphone dans <span className="ui">Rechercher un prospect</span>.</p>
</li>
<li><p>S’il n’existe pas, cliquez sur <span className="ui">Ajouter un prospect</span> et remplissez le formulaire.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>. Un panneau confirme «&nbsp;Nouveau prospect créé&nbsp;» et indique la prochaine action&nbsp;: <b>Premier contact</b>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Continuer avec le nouveau prospect</span> pour ouvrir sa fiche, puis <b>attribuez-le-vous</b> (voir plus bas).</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/s05-manual.jpg" width={1700} height={1075} alt="Formulaire Ajouter un prospect rempli" unoptimized tabIndex={0} role="button" /><figcaption>Le formulaire <span className="ui">Ajouter un prospect</span>.</figcaption>
<ol className="legend">
<li><span className="ui">Nom du contact</span>&nbsp;: le parent ou la personne qui appelle (obligatoire).</li>
<li><span className="ui">Téléphone</span>&nbsp;: la plateforme le met au format international (+212…). Facultatif, mais sans numéro valide vous ne pourrez pas appeler depuis la fiche.</li>
<li><span className="ui">Nom de l’apprenant</span> (obligatoire) et <span className="ui">Âge</span> (facultatif).</li>
<li><span className="ui">Origine</span>&nbsp;: Téléphone, Visite au centre, WhatsApp, Recommandation ou Autre.</li>
</ol>
</figure>
<div className="callout info">
<strong>Contact existant possible</strong><p>Si le même téléphone ou le même email existe déjà, un encadré jaune le signale après la création. Le prospect est créé quand même et rien n’est fusionné&nbsp;: plusieurs enfants d’une même famille restent des prospects séparés. Cliquez sur <span className="ui">Ouvrir les prospects existants</span> pour comparer.</p>
</div>
<h4>S’attribuer un prospect créé à la main</h4>
<p>Un prospect ajouté à la main n’a pas de responsable («&nbsp;Non attribué&nbsp;»). Il n’apparaît donc ni dans <span className="ui">Mes prospects</span>, ni dans vos <span className="ui">Mes tâches</span>.</p>
<figure className="fig narrow">
<Image src="/helpdesk/s05b-assign.jpg" width={1700} height={1075} alt="Fiche d’un prospect non attribué avec le menu Autres actions ouvert sur Attribuer un responsable" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>La fiche indique «&nbsp;Responsable&nbsp;: Non attribué&nbsp;».</li>
<li><span className="ui">Autres actions</span> › <span className="ui">Attribuer un responsable</span>, puis choisissez-vous.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Si vous ne le faites pas</strong><p>Le prospect existe et sa tâche aussi, mais vous les trouverez avec <span className="ui">Non attribué</span> ou <span className="ui">Toute l’équipe</span>. Si votre équipe se répartit les prospects autrement, suivez la consigne de la direction.</p>
</div>
</article>
<article className="scn" id="c2">
<header className="scn-head">
<p className="kicker">Scénario C2</p>
<h3>J’appelle un prospect</h3>
<p className="when">Une tâche <b>Premier contact</b>, <b>Appel de suivi</b> ou <b>Rappel</b> est à faire.</p>
</header>
<figure className="fig narrow">
<Image src="/helpdesk/s02-drawer.jpg" width={1700} height={1075} alt="Fiche d’un prospect avec la prochaine action, les actions rapides et les autres actions" unoptimized tabIndex={0} role="button" /><figcaption>La fiche du prospect s’ouvre sur le côté en cliquant sur son nom.</figcaption>
<ol className="legend">
<li><b>Prochaine action</b>&nbsp;: ce que la plateforme attend de vous maintenant.</li>
<li><span className="ui">Enregistrer un appel</span>&nbsp;: le bouton principal quand la tâche est un appel.</li>
<li><span className="ui">Appel</span>&nbsp;: à utiliser pour tout appel, même hors tâche.</li>
<li><span className="ui">Autres actions</span>&nbsp;: qualifier, clôturer, attribuer.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Ouvrez la fiche (clic sur le nom dans <span className="menu">Tâches</span> ou dans le tableau), puis cliquez sur <span className="ui">Enregistrer un appel</span> ou <span className="ui">Appel</span>.</p>
</li>
<li><p>La fenêtre affiche le numéro. Cliquez sur <span className="ui">Copier le numéro</span>, puis passez l’appel avec votre téléphone ou votre standard. Sur un téléphone tactile, un lien <span className="ui">Appeler</span> apparaît.</p>
</li>
<li><p>Après l’appel, choisissez <span className="ui">Résultat de l’appel</span> (liste ci-dessous), ajoutez une note si utile, puis <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<div className="callout stop">
<strong>Ouvrir l’appel n’enregistre rien</strong><p>La fenêtre le rappelle&nbsp;: «&nbsp;Ouvrir l’appel n’enregistre rien. Enregistrez le résultat après votre appel.&nbsp;» Copier le numéro ou ouvrir WhatsApp non plus. Tant que vous n’avez pas cliqué sur <span className="ui">Enregistrer</span>, la plateforme ne sait pas que vous avez appelé.</p>
</div>
<h4>Que choisir comme résultat de l’appel&nbsp;?</h4>
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
<td><span className="ui">Pas de réponse</span><br /><span className="ui">Occupé</span><br /><span className="ui">Appel refusé</span><br /><span className="ui">Injoignable</span></td>
<td><p>Appel raté. Il compte dans la série de 5 appels. Un nouveau prospect passe en <span className="st st-cont">Contact en cours</span>. La plateforme crée toute seule la tâche suivante (<b>Appel de suivi</b>) à une heure compatible avec les horaires d’appel. Vous n’avez rien à choisir.</p>
<p>La fiche affiche «&nbsp;1 appels infructueux enregistrés sur 5&nbsp;».</p>
</td>
</tr>
<tr>
<td><span className="ui">Mauvais numéro</span></td>
<td><p>Ne compte pas dans les 5 appels. La plateforme vous demande de choisir une prochaine action (par exemple retrouver le bon numéro).</p>
</td>
</tr>
<tr>
<td><span className="ui">Conversation avec le parent</span></td>
<td><p>La personne a répondu. Un second champ apparaît&nbsp;: <span className="ui">Résultat de l’échange</span>. Voir le <a href="#c3">scénario C3</a>.</p>
</td>
</tr>
</tbody>
</table>
</div>
<div className="callout info">
<strong>Le cycle de 5 appels</strong><p>La règle prévue&nbsp;: deux appels le premier jour, un le deuxième, un le quatrième, un le sixième. La plateforme planifie les appels à votre place et respecte un délai minimum entre deux appels ratés. Si vous voyez «&nbsp;Le délai minimum entre deux appels n’est pas encore écoulé&nbsp;», attendez avant d’enregistrer un autre appel raté.</p>
<p>Après le 5ᵉ appel raté, la plateforme n’en planifie plus et indique «&nbsp;Séquence automatique terminée&nbsp;». <b>Le prospect n’est pas clôturé</b>&nbsp;: à vous de décider. Vous pouvez <span className="ui">Prévoir un autre appel</span> ou <span className="ui">Clôturer&nbsp;: injoignable</span> (<a href="#c7">scénario C7</a>).</p>
</div>
<h4>Appeler depuis le tableau ou la liste</h4>
<p>Dans <span className="menu">Opportunités</span>, déposer une carte sur une autre colonne n’enregistre rien&nbsp;: cela ouvre seulement la bonne fenêtre. L’étape change uniquement quand vous enregistrez un résultat, et c’est la plateforme qui la calcule.</p>
</article>
<article className="scn" id="c3">
<header className="scn-head">
<p className="kicker">Scénario C3</p>
<h3>Le parent a répondu&nbsp;: le résultat de l’échange</h3>
<p className="when">Vous avez eu une vraie conversation, par téléphone, par WhatsApp ou au centre.</p>
</header>
<figure className="fig narrow">
<Image src="/helpdesk/s03-call.jpg" width={1700} height={1075} alt="Fenêtre Enregistrer le résultat de l’appel avec Conversation avec le parent et Intéressé, a besoin de réfléchir" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>Rappel&nbsp;: ouvrir l’appel ne suffit pas.</li>
<li><span className="ui">Résultat de l’appel</span>&nbsp;: <span className="ui">Conversation avec le parent</span>.</li>
<li><span className="ui">Résultat de l’échange</span>&nbsp;: ce que le parent a dit. La plateforme affiche «&nbsp;Étape après enregistrement&nbsp;» et calcule l’étape elle-même.</li>
<li><span className="ui">Enregistrer</span>&nbsp;: seul ce clic sauvegarde.</li>
</ol>
</figure>
<p>Pour une conversation sur WhatsApp ou au centre, utilisez <span className="ui">WhatsApp</span> › <span className="ui">Conversation réelle avec le parent</span>, ou <span className="ui">Autres actions</span> › <span className="ui">Conversation au centre / autre canal</span>. Les choix sont les mêmes.</p>
<div className="scroll">
<table>
<thead>
<tr>
<th>Résultat de l’échange</th>
<th>Étape</th>
<th>Prochaine action créée</th>
</tr>
</thead>
<tbody>
<tr>
<td><span className="ui">Souhaite passer un test de niveau</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td><b>Préparer un test de niveau</b> (rappel interne). <b>Cela ne réserve aucun test</b>&nbsp;: voir <a href="#c4">scénario C4</a>.</td>
</tr>
<tr>
<td><span className="ui">Souhaite visiter le centre</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td><b>Visite au centre</b>, avec date et heure précises (rendez-vous convenu). <a href="#c5">Scénario C5</a>.</td>
</tr>
<tr>
<td><span className="ui">Prêt à avancer vers l’inscription</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td>Suivi «&nbsp;Finaliser l’inscription&nbsp;»&nbsp;: rendez-vous convenu (par défaut) ou rappel interne.</td>
</tr>
<tr>
<td><span className="ui">Intéressé, a besoin de réfléchir</span></td>
<td><span className="st st-eng">En discussion</span> (un prospect déjà <span className="st st-qual">Qualifié</span> le reste)</td>
<td><b>Rappel · En réflexion</b> (ou Suivi WhatsApp). Rappel interne par défaut, avec une échéance à choisir.</td>
</tr>
<tr>
<td><span className="ui">Souhaite être rappelé</span></td>
<td><span className="st st-eng">En discussion</span> (ou inchangé si déjà qualifié)</td>
<td><b>Rappel</b>, par défaut avec une heure convenue avec le parent.</td>
</tr>
<tr>
<td><span className="ui">Pas intéressé</span></td>
<td><span className="st st-lost">Perdu</span></td>
<td>Aucune. Le prospect est clôturé tout de suite et ses tâches sont annulées.</td>
</tr>
<tr>
<td><span className="ui">Projet non adapté</span></td>
<td><span className="st st-nq">Non qualifié</span></td>
<td>Aucune. Il faut choisir un <span className="ui">Motif</span>&nbsp;: âge non adapté, programme non adapté, invalide ou indésirable, doublon, hors périmètre, autre.</td>
</tr>
<tr>
<td><span className="ui">Autre prochaine étape</span></td>
<td><span className="st st-qual">Qualifié</span></td>
<td>L’action de votre choix. Une note est obligatoire.</td>
</tr>
</tbody>
</table>
</div>
<ul className="tight">
<li>Quand le prospect est déjà <span className="st st-qual">Qualifié</span>, les quatre résultats qui qualifient (test, visite, inscription, autre) ne sont plus proposés.</li>
<li>Un résultat qui fixe une suite (test, visite, inscription, réflexion, rappel) remplace le rappel ou le suivi WhatsApp déjà prévu, pour ne pas avoir deux relances en double. Les visites, les préparations de test et les suivis d’inscription déjà prévus restent.</li>
<li>Une vraie conversation remet à zéro le compteur d’appels ratés.</li>
</ul>
<div className="callout info">
<strong>Rendez-vous convenu ou Rappel interne&nbsp;?</strong><p><b>Rendez-vous convenu</b>&nbsp;: vous avez fixé une heure avec le parent (il l’attend). <b>Rappel interne</b>&nbsp;: c’est un pense-bête pour l’équipe, aucune heure n’a été promise.</p>
<p>Un rappel convenu garde son heure exacte, qui doit tomber dans les horaires d’appel fixés par la direction. Sinon l’enregistrement est refusé avec «&nbsp;Cette heure convenue est hors des horaires d’appel&nbsp;». Les horaires ne sont pas affichés à l’écran&nbsp;: demandez-les à la direction. Un rappel interne, lui, est décalé automatiquement au prochain créneau.</p>
</div>
<div className="callout warn">
<strong>«&nbsp;En réflexion&nbsp;» n’est pas une étape</strong><p>C’est une précision sur le rappel. Un prospect qui a besoin de temps garde son étape actuelle.</p>
</div>
<div className="callout info">
<strong>WhatsApp «&nbsp;Message envoyé&nbsp;»</strong><p>Dans <span className="ui">WhatsApp</span>, le choix <span className="ui">Message envoyé</span> ajoute seulement une ligne à l’historique. Il ne change ni l’étape ni la prochaine action, et il ne termine pas une tâche «&nbsp;Suivi WhatsApp&nbsp;».</p>
</div>
</article>
<article className="scn" id="c4">
<header className="scn-head">
<p className="kicker">Scénario C4</p>
<h3>Réserver un test de niveau</h3>
<p className="when">Un prospect <span className="st st-qual">Qualifié</span> veut passer un test.</p>
</header>
<ol className="steps">
<li><p>Ouvrez la fiche. Si la prochaine action est <b>Préparer un test de niveau</b>, le bouton <span className="ui">Réserver un test</span> est dans cet encadré. Sinon il est dans la section <b>Test de niveau</b>, plus bas.</p>
</li>
<li><p>Remplissez la fenêtre, puis <span className="ui">Enregistrer</span>. Un message confirme «&nbsp;Test créé&nbsp;».</p>
</li>
<li><p>Le prospect affiche «&nbsp;Test de niveau prévu&nbsp;», et la tâche de préparation est fermée automatiquement. Le test apparaît dans <span className="menu">Admissions</span> › <span className="menu">Calendrier</span>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s06-booking.jpg" width={1700} height={1075} alt="Fenêtre de réservation d’un test de niveau" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Date</span>&nbsp;: doit être dans le futur.</li>
<li><span className="ui">Heure</span>&nbsp;: obligatoire pour un prospect.</li>
<li><span className="ui">Examinateur</span>&nbsp;: un simple nom. La plateforme ne vérifie aucune disponibilité.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<h4>Le calendrier</h4>
<figure className="fig">
<Image src="/helpdesk/s07-calendar.jpg" width={1700} height={1075} alt="Calendrier admissions sur une semaine avec des tests de niveau et une visite au centre" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Période</span>&nbsp;: <b>Jour</b> ou <b>Semaine</b>. La semaine compte 7 jours à partir de la date de début, pas du lundi.</li>
<li><span className="ui">Rendez-vous</span>&nbsp;: tests et visites, tests seulement, ou visites seulement.</li>
<li><span className="ui">Inclure les tests terminés</span>&nbsp;: sans cette case, seuls les tests «&nbsp;Planifié&nbsp;» sont affichés.</li>
</ol>
</figure>
<p>Cliquer sur une ligne liée à un prospect ouvre sa fiche. Une ligne sans prospect (test créé à la main) ouvre le formulaire du test.</p>
<h4>Après le test</h4>
<ol className="steps">
<li><p>Ouvrez la fiche du prospect, section <b>Test de niveau</b>, puis <span className="ui">Voir</span>.</p>
</li>
<li><p>Changez <span className="ui">Statut</span>&nbsp;: <b>Passé</b> quand le test a eu lieu, puis <b>Résultat saisi</b> avec le <span className="ui">Score</span> et le <span className="ui">Niveau recommandé</span> (obligatoire).</p>
</li>
<li><p>La plateforme crée la tâche <b>Rappeler le parent · Résultat disponible</b>. Appelez le parent&nbsp;: aucun email de résultat n’est envoyé depuis votre espace.</p>
</li>
</ol>
<div className="callout warn">
<strong>À retenir</strong><ul className="tight">
<li><b>Un test ne peut pas être annulé.</b> Si la date change, utilisez <span className="ui">Reprogrammer</span>. Ne marquez pas «&nbsp;Passé&nbsp;» pour le faire disparaître.</li>
<li>Un test terminé n’inscrit pas le prospect&nbsp;: il reste <span className="st st-qual">Qualifié</span>.</li>
<li><span className="ui">Planifier un test</span> sur la page <span className="menu">Tests de niveau</span> crée un test <b>sans lien avec un prospect</b>&nbsp;: aucune tâche n’est fermée et l’historique du prospect n’est pas mis à jour. Pour un prospect, réservez toujours depuis sa fiche.</li>
</ul>
</div>
</article>
<article className="scn" id="c5">
<header className="scn-head">
<p className="kicker">Scénario C5</p>
<h3>Organiser une visite au centre</h3>
<p className="when">Le parent veut venir voir le centre.</p>
</header>
<ol className="steps">
<li><p>Au téléphone, choisissez <span className="ui">Conversation avec le parent</span> puis <span className="ui">Souhaite visiter le centre</span>.</p>
</li>
<li><p>Saisissez la <span className="ui">Date et heure · Casablanca</span> convenue avec le parent. La visite est toujours un rendez-vous convenu.</p>
</li>
<li><p>Le prospect passe <span className="st st-qual">Qualifié</span>. La visite apparaît dans <span className="menu">Tâches</span> et dans <span className="menu">Calendrier</span>.</p>
</li>
<li><p>Après la visite, cliquez sur <span className="ui">Marquer comme fait</span>. Indiquez le <span className="ui">Résultat de l’action</span> (200 caractères au maximum) et <b>choisissez la prochaine action</b>.</p>
</li>
</ol>
<div className="callout warn">
<strong>«&nbsp;Marquer comme fait&nbsp;» ne fait que fermer la tâche</strong><p>Cela ne réserve pas de test, ne commence pas d’inscription et ne change pas l’étape. Pour avancer, utilisez les boutons de la fiche&nbsp;: <span className="ui">Réserver un test</span> ou <span className="ui">Commencer l&apos;inscription</span>.</p>
</div>
<p>Pour décaler une visite&nbsp;: <span className="ui">Replanifier</span>, nouvelle date et heure. Pour la supprimer&nbsp;: <span className="ui">Annuler l’action</span> dans la fiche (un motif et une nouvelle prochaine action sont demandés). Le bouton <span className="ui">Annuler</span> n’existe pas sur les lignes de la page Tâches.</p>
</article>
<article className="scn" id="c6">
<header className="scn-head">
<p className="kicker">Scénario C6</p>
<h3>Inscrire un prospect&nbsp;: de la fiche au paiement</h3>
<p className="when">Le prospect est <span className="st st-qual">Qualifié</span> et veut s’inscrire. Il y a deux temps&nbsp;: créer la pré-inscription, puis encaisser.</p>
</header>
<ol className="flow">
<li><b>Prospect Qualifié</b><small>le projet est qualifié</small></li>
<li><b>Pré-inscription</b><small>«&nbsp;Commencer l&apos;inscription&nbsp;»&nbsp;: le prospect reste Qualifié</small></li>
<li><b>Paiement</b><small>«&nbsp;Nouveau reçu&nbsp;»&nbsp;: inscription confirmée</small></li>
<li><b>Groupe affecté</b><small>«&nbsp;Groupe à affecter&nbsp;»&nbsp;: inscription validée</small></li>
</ol>
<h4>Temps 1&nbsp;: créer la pré-inscription</h4>
<ol className="steps">
<li><p>Dans la fiche, section <b>Inscription</b>, cliquez sur <span className="ui">Commencer l&apos;inscription</span>. Le bouton n’existe que pour un prospect <span className="st st-qual">Qualifié</span> sans inscription.</p>
</li>
<li><p><b>Étape 1/3, Apprenant.</b> Saisissez le <span className="ui">Nom de l’apprenant</span> et, si vous la connaissez, la date de naissance (pas dans le futur). La plateforme cherche les apprenants déjà connus&nbsp;: <span className="ui">Utiliser cet apprenant</span> s’il s’agit de lui, sinon <span className="ui">Créer un nouvel apprenant</span> et cochez «&nbsp;J’ai vérifié les correspondances&nbsp;: il s’agit d’un autre apprenant&nbsp;».</p>
</li>
<li><p><b>Étape 2/3, Inscription.</b> Programme, année scolaire, niveau proposé, groupe (ou «&nbsp;À affecter plus tard&nbsp;») et <span className="ui">Démarrage</span>&nbsp;: <span className="ui">Pré-inscription</span> ou <span className="ui">Essai (groupe requis)</span>.</p>
</li>
<li><p><b>Étape 3/3, Vérification.</b> Relisez, puis <span className="ui">Créer la pré-inscription</span>. Un panneau confirme «&nbsp;Pré-inscription créée&nbsp;» et rappelle que <b>le prospect reste qualifié, l’inscription n’est pas encore confirmée</b>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s08-enroll.jpg" width={1700} height={1075} alt="Fenêtre Commencer l&apos;inscription, étape 2 sur 3" unoptimized tabIndex={0} role="button" /><figcaption>Étape 2 sur 3 de la fenêtre <span className="ui">Commencer l&apos;inscription</span>.</figcaption>
<ol className="legend">
<li><span className="ui">Programme</span>&nbsp;: «&nbsp;Programme annuel&nbsp;», «&nbsp;Adultes&nbsp;», «&nbsp;Stage d’été&nbsp;»…</li>
<li><span className="ui">Niveau proposé</span>&nbsp;: «&nbsp;À définir&nbsp;» si le test n’a pas eu lieu.</li>
<li><span className="ui">Groupe</span>&nbsp;: seuls les groupes compatibles sont proposés.</li>
<li><span className="ui">Démarrage</span>&nbsp;: une pré-inscription n’engage rien, un essai exige un groupe.</li>
</ol>
</figure>
<h4>Temps 2&nbsp;: encaisser et confirmer</h4>
<ol className="steps">
<li><p>Dans la fiche, cliquez sur <span className="ui">Continuer l&apos;inscription</span>&nbsp;: la fiche de l’apprenant s’ouvre avec l’inscription mise en évidence («&nbsp;Inscription liée au prospect CRM&nbsp;»).</p>
</li>
<li><p>Dans la section <b>Paiements</b>, cliquez sur <span className="ui">Nouveau reçu</span>.</p>
</li>
<li><p>Choisissez la <span className="ui">Session</span> (par exemple Yearly), puis, dans <span className="ui">Inscription à rattacher</span>, <b>sélectionnez l’inscription «&nbsp;Inscription CRM · Submitted…&nbsp;»</b>. C’est obligatoire&nbsp;: la plateforme refuse le paiement sinon, pour éviter un doublon.</p>
</li>
<li><p>Saisissez le <span className="ui">Prix brut convenu</span>, la <span className="ui">Remise</span> éventuelle, le <span className="ui">Montant payé aujourd’hui</span> et le mode de paiement, puis <span className="ui">Enregistrer et générer le reçu</span>.</p>
</li>
<li><p>Le message «&nbsp;Paiement enregistré. Apprenant inscrit — groupe à affecter.&nbsp;» s’affiche et le reçu s’ouvre. Le prospect passe en <span className="st st-conv">Inscription confirmée</span> et ses tâches sont fermées.</p>
</li>
<li><p>Terminez par l’affectation du groupe&nbsp;: <a href="#q9">scénario Q9</a>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s09-receipt-existing.jpg" width={1700} height={1563} alt="Formulaire de paiement avec l’inscription à rattacher « Inscription CRM · Submitted », le prix et le montant payé" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Inscription à rattacher</span>&nbsp;: choisissez la ligne qui commence par «&nbsp;Inscription CRM&nbsp;·&nbsp;». C’est l’inscription créée depuis le prospect, et c’est ce choix qui le convertit. Les statuts sont en anglais dans cette liste (Submitted = Soumise).</li>
<li><span className="ui">Prix brut convenu</span>&nbsp;: saisi à chaque nouvel engagement, il n’y a pas de tarif par défaut.</li>
<li><span className="ui">Montant payé aujourd’hui</span>&nbsp;: il ne peut pas dépasser le solde.</li>
<li><span className="ui">Envoyer aussi le reçu par email</span>&nbsp;: facultatif, désactivé par défaut.</li>
</ol>
</figure>
<div className="callout stop">
<strong>Montant à 0&nbsp;: rien n’est confirmé</strong><p>Avec un paiement de 0, la plateforme enregistre seulement l’engagement&nbsp;: «&nbsp;Aucun reçu ne sera émis, aucun email ne sera envoyé et l’inscription ne sera pas confirmée.&nbsp;» Le prospect reste <span className="st st-qual">Qualifié</span>.</p>
</div>
<div className="callout warn">
<strong>Ne vous arrêtez pas à «&nbsp;Créer la pré-inscription&nbsp;»</strong><p>Tant qu’il n’y a pas de paiement, le prospect n’est pas converti&nbsp;: il reste <span className="st st-qual">Qualifié</span> et la tâche <b>Finaliser l’inscription</b> reste ouverte pour vous le rappeler. La terminer avec <span className="ui">Marquer comme fait</span> ne confirme rien.</p>
</div>
</article>
<article className="scn" id="c7">
<header className="scn-head">
<p className="kicker">Scénario C7</p>
<h3>Clôturer ou rouvrir un prospect</h3>
<p className="when">Le suivi est terminé sans inscription, ou un prospect clôturé redevient actif.</p>
</header>
<ol className="steps">
<li><p>Dans la fiche, cliquez sur <span className="ui">Autres actions</span>, puis <span className="ui">Clôturer comme perdu</span> ou <span className="ui">Clôturer comme non qualifié</span>.</p>
</li>
<li><p>Choisissez le <span className="ui">Motif</span>, ajoutez une note (obligatoire si le motif est «&nbsp;Autre&nbsp;»), puis <span className="ui">Enregistrer</span>.</p>
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
<td>Injoignable, Pas intéressé, Prix, Horaires, Localisation, Autre centre choisi, Projet reporté, Autre.<br />«&nbsp;Injoignable&nbsp;» n’est possible qu’après 5 appels ratés.</td>
</tr>
<tr>
<td><span className="st st-nq">Non qualifié</span></td>
<td>Âge non adapté, Programme non adapté, Invalide / indésirable, Doublon, Hors périmètre, Autre.</td>
</tr>
</tbody>
</table>
</div>
<ul className="tight">
<li>Une clôture annule <b>toutes</b> les tâches ouvertes du prospect.</li>
<li>Les prospects clôturés ne sont plus dans le tableau. Ouvrez la vue <span className="ui">Clôturés</span> ou le lien «&nbsp;0 clôturés&nbsp;» en haut de page (affichage en liste).</li>
<li><b>Rouvrir</b>&nbsp;: fiche › <span className="ui">Rouvrir le prospect</span>. Un motif et une prochaine action sont demandés. Le prospect revient en «&nbsp;En discussion&nbsp;» s’il y a déjà eu une conversation, sinon en «&nbsp;Contact en cours&nbsp;», et le compteur d’appels repart à zéro.</li>
<li>Un prospect <span className="st st-conv">Inscription confirmée</span> ne peut plus être rouvert ni modifié depuis cet écran.</li>
</ul>
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
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Annuaire</span>.</p>
</li>
<li><p>Tapez dans la barre de recherche le <b>nom</b>, l’<b>email</b> ou le <b>numéro de téléphone</b>. La liste se réduit à mesure que vous tapez.</p>
</li>
<li><p>Pour affiner, utilisez <span className="ui">Toutes les sessions</span>, <span className="ui">Tous les niveaux</span>, <span className="ui">Tous les statuts</span> et <span className="ui">Toutes catégories</span>. <span className="ui">Grille</span> et <span className="ui">Liste</span> changent seulement l’affichage.</p>
</li>
<li><p>Cliquez sur la carte de la personne pour ouvrir sa <b>fiche</b> (niveau, solde, paiements, inscriptions, groupe).</p>
</li>
</ol>
<figure className="fig">
<Image src="/helpdesk/q01-annuaire.jpg" width={1700} height={1075} alt="Annuaire des apprenants avec une recherche par numéro de téléphone et la carte d’un apprenant" unoptimized tabIndex={0} role="button" /><figcaption>L’Annuaire, ici avec une recherche par numéro de téléphone.</figcaption>
<ol className="legend">
<li>La recherche accepte le nom, l’email et le <b>téléphone</b>.</li>
<li>La carte indique la catégorie, le groupe, le téléphone et le statut du dossier. Un clic ouvre la fiche.</li>
</ol>
</figure>
<div className="callout info">
<strong>Annuaire ou Liste des apprenants&nbsp;?</strong><p>Utilisez l’<b>Annuaire</b> pour retrouver quelqu’un, surtout par son téléphone. Utilisez la <b>Liste des apprenants</b> pour travailler&nbsp;: paiement, groupe à affecter, filtres. Sa recherche porte sur le nom et l’email, pas sur le téléphone.</p>
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
<li><p><b>Cherchez d’abord</b> dans l’<span className="menu">Annuaire</span> (<a href="#q1">Q1</a>)&nbsp;: ce formulaire ne détecte aucun doublon.</p>
</li>
<li><p>Ouvrez <span className="menu">Apprenants</span> › <span className="menu">Ajouter un apprenant</span>. Seul le <span className="ui">Nom complet</span> est obligatoire&nbsp;; remplissez le reste si vous le savez&nbsp;: <span className="ui">Date de naissance</span>, <span className="ui">Téléphone</span>, <span className="ui">Email apprenant</span>, <span className="ui">Email parent</span>, <span className="ui">Catégorie d’âge</span>, <span className="ui">Session</span>, <span className="ui">Niveau</span>, <span className="ui">Source</span>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>. Le message «&nbsp;Apprenant créé&nbsp;» s’affiche et la fiche s’ouvre. Le dossier n’a <b>ni inscription ni groupe</b>&nbsp;: pour inscrire, voir <a href="#q7">Q7</a> (pré-inscription) ou <a href="#q3">Q3</a> (paiement).</p>
</li>
</ol>
<div className="callout stop">
<strong>Ne cliquez pas deux fois</strong><p>Après une erreur ou une coupure, un nouvel envoi peut créer un second apprenant. Regardez d’abord dans l’Annuaire avant de recommencer.</p>
</div>
<h4>Compléter ou corriger un dossier</h4>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant (<a href="#q1">Q1</a>) et cliquez sur <span className="ui">Modifier</span>, en haut à droite.</p>
</li>
<li><p>Corrigez le nom, la date de naissance, le téléphone, la catégorie d’âge ou les notes, puis <span className="ui">Enregistrer</span> («&nbsp;Apprenant mis à jour&nbsp;»). Vous pouvez aussi ajouter une <span className="ui">Photo</span> (JPEG ou PNG).</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q02-modifier-apprenant.jpg" width={1700} height={1075} alt="Formulaire Modifier l’apprenant avec la photo, le nom complet, les emails en lecture seule et le bouton Enregistrer" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Photo</span>&nbsp;: JPEG ou PNG.</li>
<li><span className="ui">Nom complet</span>&nbsp;: le seul champ obligatoire.</li>
<li><span className="ui">Email apprenant</span> et <span className="ui">Email parent</span>&nbsp;: en <b>lecture seule</b> quand vous modifiez un dossier. Ces adresses servent à la connexion des familles&nbsp;: demandez à la direction pour les changer.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<p>La session et le niveau ne se changent pas ici&nbsp;: le formulaire le rappelle. Pour déplacer l’apprenant, voir <a href="#q10">Q10</a>.</p>
<h4>Ajouter un document</h4>
<p>Les documents se déposent sur l’<b>inscription</b>, dans la section <b>Inscriptions et groupes</b> de la fiche&nbsp;: cliquez sur <span className="ui">Ajouter un document</span> sous l’inscription concernée. Formats acceptés&nbsp;: JPEG, PNG ou PDF, 10&nbsp;Mo au plus.</p>
<figure className="fig">
<Image src="/helpdesk/q02b-fiche-inscriptions.jpg" width={1700} height={1475} alt="Fiche d’un apprenant avec la section Inscriptions et groupes, les boutons Nouvelle pré-inscription, Modifier l’inscription et Ajouter un document" unoptimized tabIndex={0} role="button" /><figcaption>La fiche d’un apprenant, section <b>Inscriptions et groupes</b>.</figcaption>
<ol className="legend">
<li><span className="ui">Nouvelle pré-inscription</span>&nbsp;: prépare une inscription à la main (<a href="#q7">Q7</a>).</li>
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
<td>Elle s’inscrit mais paiera plus tard</td>
<td>Même écran, <span className="ui">Montant payé aujourd’hui</span> à <b>0</b>&nbsp;: seul l’engagement est enregistré, sans reçu, et l’inscription n’est pas confirmée.</td>
</tr>
<tr>
<td>L’apprenant est déjà connu (ancien élève, frère ou sœur)</td>
<td><span className="menu">Nouveau reçu</span> › <span className="ui">Rechercher un apprenant</span>, pour ne pas créer de doublon.</td>
</tr>
<tr>
<td>Vous voulez seulement créer le dossier, sans paiement</td>
<td><span className="menu">Apprenants</span> › <span className="menu">Ajouter un apprenant</span> (<a href="#q2">Q2</a>). Cherchez-le d’abord dans l’Annuaire&nbsp;: ce formulaire ne détecte aucun doublon.</td>
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
<li><p>Regardez le bloc <b>Dossiers ressemblants</b> qui s’affiche. Si c’est la même personne, cliquez sur le dossier. Sinon continuez&nbsp;: un homonyme est autorisé. Un téléphone déjà utilisé affiche seulement un avertissement (une famille peut partager un numéro).</p>
</li>
<li><p><b>Étape 2.</b> Choisissez la <span className="ui">Session</span> et l’<span className="ui">Année scolaire</span> (2026/2027 par défaut), puis éventuellement le <span className="ui">Niveau</span>.</p>
</li>
<li><p><b>Étape 3.</b> Saisissez le <span className="ui">Prix brut convenu</span>, la <span className="ui">Remise</span> et l’<span className="ui">Échéance</span> si besoin, le <span className="ui">Montant payé aujourd’hui</span>, la date et le <span className="ui">Mode de paiement</span> (Espèces par défaut, Carte bancaire, Virement, Chèque).</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer et générer le reçu</span>. Le message «&nbsp;Apprenant inscrit — groupe à affecter&nbsp;» s’affiche et le reçu s’ouvre.</p>
</li>
<li><p>Imprimez avec <span className="ui">Imprimer A5</span> ou téléchargez avec <span className="ui">PDF A5</span>, puis passez au <a href="#q9">scénario Q9</a> pour le groupe.</p>
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
<div className="callout warn">
<strong>Terminez ensuite le dossier</strong><p>Un apprenant créé depuis le reçu n’a que son nom et ses contacts. Complétez la date de naissance et la catégorie depuis sa fiche (<span className="ui">Modifier</span>, <a href="#q2">Q2</a>).</p>
</div>
<div className="callout stop">
<strong>Ne saisissez pas deux fois</strong><p>Un nouveau formulaire enregistre toujours un nouveau reçu. Si un message dit «&nbsp;Ce paiement a peut-être déjà été enregistré&nbsp;», ouvrez d’abord la liste des reçus de l’apprenant et vérifiez avant de recommencer.</p>
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
<li><span className="ui">Nouvelle pré-inscription</span>&nbsp;: pour préparer une inscription à la main.</li>
<li><span className="ui">Encaisser</span>&nbsp;: ouvre le formulaire de paiement déjà rempli pour cet engagement.</li>
</ol>
</figure>
<ol className="steps">
<li><p>Ouvrez la fiche de l’apprenant, puis cliquez sur <span className="ui">Encaisser</span> à côté de l’engagement. Ou&nbsp;: <span className="menu">Nouveau reçu</span> › <span className="ui">Rechercher un apprenant</span> › <span className="ui">Choisir un engagement</span>.</p>
</li>
<li><p>Les conditions de l’engagement sont verrouillées. Vous voyez <b>Prix net</b>, <b>Déjà payé</b> et <b>Solde</b>.</p>
</li>
<li><p>Saisissez le montant payé aujourd’hui, qui ne peut pas dépasser le solde (sinon&nbsp;: «&nbsp;Le paiement dépasse le solde de … MAD&nbsp;»), puis <span className="ui">Enregistrer et générer le reçu</span>.</p>
</li>
</ol>
<p>Chaque paiement donne un nouveau reçu. Les reçus précédents ne changent jamais&nbsp;: le «&nbsp;restant historique&nbsp;» est le solde à la date de chaque reçu, alors que «&nbsp;Situation des paiements&nbsp;» montre le solde d’aujourd’hui.</p>
<p>Pour retrouver ensuite le reçu ou la liste des impayés&nbsp;: <a href="#q6">Q6</a> et <a href="#q5">Q5</a>.</p>
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
<li>Par défaut, seuls les «&nbsp;Dossiers actifs (inscrits, essai, anciens)&nbsp;» sont listés&nbsp;: choisissez <span className="ui">Tous les statuts</span> pour voir les autres.</li>
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
<h3>Gérer les pré-inscriptions</h3>
<p className="when">Vous préparez ou suivez une inscription qui n’est pas encore payée, sans passer par un prospect.</p>
</header>
<p>La page <span className="menu">Admissions</span> › <span className="menu">Inscriptions</span> (titre «&nbsp;Pré-inscriptions&nbsp;») liste les pré-inscriptions en attente. Une pré-inscription <b>n’engage rien</b>&nbsp;: l’inscription n’est confirmée que par un paiement (<a href="#q3">Q3</a>, <a href="#q4">Q4</a>).</p>
<figure className="fig">
<Image src="/helpdesk/q07-preinscriptions.jpg" width={1700} height={1075} alt="Page Pré-inscriptions avec le filtre de statut, le bouton Nouvelle inscription et la colonne Statut" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>Le filtre du haut montre par défaut les pré-inscriptions <b>En attente</b>&nbsp;; changez-le pour en voir d’autres.</li>
<li><span className="ui">Nouvelle inscription</span>&nbsp;: crée une pré-inscription.</li>
<li>Le statut, affiché en anglais&nbsp;: Submitted (soumise), Under Review (en cours d’examen), Trial (essai), Rejected (refusée).</li>
</ol>
</figure>
<h4>Créer une pré-inscription</h4>
<ol className="steps">
<li><p>L’apprenant doit déjà avoir un dossier&nbsp;: sinon créez-le d’abord (<a href="#q2">Q2</a>).</p>
</li>
<li><p>Cliquez sur <span className="ui">Nouvelle inscription</span>. Choisissez la <span className="ui">Session</span> et l’<span className="ui">Apprenant</span>&nbsp;: un encadré bleu rappelle son téléphone, sa catégorie et son statut.</p>
</li>
<li><p>Précisez le <span className="ui">Niveau de cette inscription</span> («&nbsp;À définir lors de l’affectation&nbsp;» si le test n’a pas eu lieu) et, si vous le connaissez, le <span className="ui">Groupe</span>. Seuls les groupes de la même session et du même niveau sont proposés.</p>
</li>
<li><p>Choisissez le <span className="ui">Statut</span> (<b>Submitted</b>, <b>Under Review</b> ou <b>Trial</b>), vérifiez la <span className="ui">Date</span>, ajoutez des <span className="ui">Notes</span> si besoin, puis <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q07b-preinscription-formulaire.jpg" width={1700} height={1075} alt="Fenêtre Nouvelle pré-inscription avec la session, l’apprenant, le niveau, le groupe et le statut" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Session</span>&nbsp;; l’année scolaire est proposée automatiquement.</li>
<li><span className="ui">Apprenant</span>&nbsp;: choisissez-le dans la liste.</li>
<li><span className="ui">Groupe</span>&nbsp;: facultatif («&nbsp;Choisir un groupe&nbsp;»). Un statut <b>Trial</b> exige un groupe.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<p>On peut aussi créer une pré-inscription depuis la fiche de l’apprenant (<span className="ui">Nouvelle pré-inscription</span>, <a href="#q2">Q2</a>), ou depuis la fiche d’un prospect (<a href="#c6">C6</a>). Pour modifier une pré-inscription, cliquez sur l’icône de modification à droite de la ligne.</p>
<div className="callout warn">
<strong>Valider ou refuser&nbsp;: pas chez vous</strong><p>Vous ne pouvez ni valider, ni refuser, ni supprimer une pré-inscription. De votre côté, la confirmation passe par le <b>paiement</b>&nbsp;; ensuite il reste à affecter le groupe (<a href="#q9">Q9</a>).</p>
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
<li><p>Saisissez le <span className="ui">Nom du groupe</span> (obligatoire). Il n’y a pas de règle imposée&nbsp;; suivez l’usage de l’équipe, par exemple «&nbsp;Child 2 · Samedi après-midi&nbsp;».</p>
</li>
<li><p>Choisissez la <span className="ui">Session</span> puis le <span className="ui">Niveau</span> (la liste des niveaux dépend de la session) et la <span className="ui">Catégorie</span>.</p>
</li>
<li><p><b>Choisissez l’<span className="ui">Enseignant</span></b>&nbsp;: c’est le champ qui <b>lie le groupe à son enseignant</b>, et il est obligatoire.</p>
</li>
<li><p>Renseignez la <span className="ui">Salle</span>, les <span className="ui">Jours</span> (par exemple «&nbsp;Lun, Mer, Ven&nbsp;»), l’<span className="ui">Horaire</span> (par exemple «&nbsp;18h – 19h30&nbsp;»), la <span className="ui">Capacité max</span> et le <span className="ui">Terme</span>.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>&nbsp;: le message «&nbsp;Groupe créé&nbsp;» s’affiche.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q08-groupe-formulaire.jpg" width={1700} height={1075} alt="Fenêtre Nouveau groupe avec le nom, l’enseignant, les jours et le bouton Enregistrer" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Nom du groupe</span>&nbsp;: obligatoire.</li>
<li><span className="ui">Enseignant</span>&nbsp;: obligatoire. Il choisit parmi les enseignants existants.</li>
<li><span className="ui">Jours</span>&nbsp;: du texte libre, mais l’<b>Emploi du temps</b> s’en sert (écrivez Lun, Mar, Mer, Jeu, Ven, Sam, Dim).</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<h4>Modifier un groupe, changer d’enseignant</h4>
<p>Dans la liste, cliquez sur l’icône de modification à droite de la ligne du groupe. La fenêtre «&nbsp;Modifier le groupe&nbsp;» s’ouvre&nbsp;: changez l’<span className="ui">Enseignant</span>, l’horaire, la salle ou la capacité, puis <span className="ui">Enregistrer</span> («&nbsp;Groupe mis à jour&nbsp;»). La page du groupe (clic sur son nom) montre ses apprenants (<a href="#q10">Q10</a>).</p>
<div className="callout info">
<strong>Bon à savoir</strong><ul className="tight">
<li>L’enseignant doit exister dans la plateforme. Un nouvel enseignant se demande à la direction (<a href="#q12">Q12</a>).</li>
<li>La capacité est indicative&nbsp;: un groupe «&nbsp;complet&nbsp;» accepte quand même un nouvel apprenant.</li>
<li>Vous ne pouvez pas supprimer un groupe&nbsp;: demandez à la direction.</li>
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
<li><p>Dans la fenêtre <b>Affecter un groupe</b>, vérifiez le niveau et choisissez le <span className="ui">Groupe</span>. Seuls les groupes de la même session et du même niveau sont proposés.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span> («&nbsp;Mis à jour&nbsp;»). L’inscription passe à <b>Inscription validée</b>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s13-students-filter.jpg" width={1700} height={1075} alt="Liste des apprenants filtrée sur Groupe à affecter" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Plus de filtres</span> donne accès au filtre d’affectation.</li>
<li>Le lien <span className="ui">Groupe à affecter · …</span> ouvre la fenêtre d’affectation.</li>
</ol>
</figure>
<figure className="fig narrow">
<Image src="/helpdesk/s14-assign.jpg" width={1700} height={1075} alt="Fenêtre Affecter un groupe avec le niveau et le groupe" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Niveau de cette inscription</span>.</li>
<li><span className="ui">Groupe</span>&nbsp;: filtré par session et niveau.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<div className="callout info">
<strong>Bon à savoir</strong><ul className="tight">
<li>La liste ne montre par défaut que les «&nbsp;Dossiers actifs (inscrits, essai, anciens)&nbsp;». Pour voir aussi les prospects, choisissez <span className="ui">Tous les statuts</span>.</li>
<li>Pas de niveau sur le dossier&nbsp;? La plateforme vous demande de créer une pré-inscription avec un niveau depuis la fiche apprenant.</li>
<li>L’autre voie&nbsp;: <span className="menu">Groupes &amp; niveaux</span> › le groupe › <span className="ui">Ajouter des apprenants</span>. Elle refuse certains cas (plusieurs inscriptions en attente). Le lien de la liste est plus fiable.</li>
<li>Pour changer quelqu’un de groupe, ou le sortir d’un groupe&nbsp;: <a href="#q10">Q10</a>.</li>
<li>La capacité d’un groupe est indicative&nbsp;: un groupe «&nbsp;complet&nbsp;» accepte quand même un nouvel apprenant. Pour créer le groupe qui manque&nbsp;: <a href="#q8">Q8</a>.</li>
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
<li><p>Dans la fenêtre <b>Affecter un groupe</b>, choisissez le nouveau <span className="ui">Groupe</span>. L’encadré vert rappelle l’horaire, le jour, la salle et la capacité.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q10-changer-groupe.jpg" width={1700} height={1075} alt="Fenêtre Affecter un groupe ouverte depuis la fiche d’un apprenant déjà inscrit, avec le choix du groupe" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Groupe</span>&nbsp;: filtré par session et niveau de l’inscription.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
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
<li><p>Choisissez le <span className="ui">Groupe</span>. La <span className="ui">Date de séance</span> est celle d’aujourd’hui.</p>
</li>
<li><p>Pour chaque apprenant, cliquez sur <span className="ui">Absent</span>, <span className="ui">Retard</span> ou <span className="ui">Justifié</span> si besoin.</p>
</li>
<li><p>Cliquez sur <span className="ui">Enregistrer les présences</span>. Un message confirme «&nbsp;Présences enregistrées&nbsp;».</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/s15-attendance.jpg" width={1700} height={1075} alt="Page Gestion des présences avec deux apprenants" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Groupe</span>.</li>
<li><span className="ui">Date de séance</span>.</li>
<li>Le compteur du haut ne compte que les apprenants que vous avez cliqués.</li>
<li><span className="ui">Enregistrer les présences</span>.</li>
</ol>
</figure>
<div className="callout stop">
<strong>Tout le monde est «&nbsp;Présent&nbsp;» par défaut</strong><p>Un apprenant que vous n’avez pas touché est affiché «&nbsp;Présent&nbsp;», et <span className="ui">Enregistrer les présences</span> l’enregistre comme présent. Le compteur «&nbsp;0 présents&nbsp;» en haut de page est trompeur tant que vous n’avez rien cliqué. Vérifiez les absents avant d’enregistrer.</p>
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
<li><p>Pour corriger, cliquez sur <span className="ui">Modifier</span>. Dans «&nbsp;Modifier le profil enseignant&nbsp;», changez le <span className="ui">Nom complet</span>, le <span className="ui">Téléphone</span>, les <span className="ui">Certifications</span> (CELTA, DELTA, TKT, Licence, Master, Autre) et les <span className="ui">Niveaux autorisés</span>, puis <span className="ui">Enregistrer</span>.</p>
</li>
</ol>
<figure className="fig narrow">
<Image src="/helpdesk/q12-enseignants.jpg" width={1700} height={1075} alt="Liste des enseignants avec la recherche et trois cartes d’enseignants" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li>La recherche par nom.</li>
<li>Le nom de l’enseignant&nbsp;: un clic ouvre son profil.</li>
</ol>
</figure>
<figure className="fig narrow">
<Image src="/helpdesk/q12b-enseignant-modifier.jpg" width={1700} height={1075} alt="Formulaire Modifier le profil enseignant avec l’email en lecture seule, les certifications et les niveaux autorisés" unoptimized tabIndex={0} role="button" /><ol className="legend">
<li><span className="ui">Email</span>&nbsp;: en lecture seule.</li>
<li><span className="ui">Certifications</span>&nbsp;: un clic active ou désactive.</li>
<li><span className="ui">Niveaux autorisés</span>&nbsp;: les niveaux en bleu sont ceux que l’enseignant peut donner.</li>
<li><span className="ui">Enregistrer</span>.</li>
</ol>
</figure>
<div className="callout warn">
<strong>Ajouter un enseignant&nbsp;: à demander à la direction</strong><p>Il n’y a pas de bouton <span className="ui">Ajouter</span> dans votre espace, ni d’accès aux contrats, salaires et congés. Quand un nouvel enseignant arrive, demandez à la direction de le créer&nbsp;; il apparaît ensuite dans la liste <span className="ui">Enseignant</span> d’un groupe, et vous pouvez le <b>lier à un groupe</b> comme dans <a href="#q8">Q8</a>.</p>
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
<strong>En lecture seule</strong><p>L’emploi du temps ne se modifie pas ici. Un groupe apparaît les jours écrits dans son champ <span className="ui">Jours</span>&nbsp;; pour changer un horaire, modifiez le groupe (<a href="#q8">Q8</a>). Un groupe sans jours n’apparaît pas dans la grille.</p>
</div>
<p><span className="menu">Notes &amp; bulletins</span> est aussi en lecture seule&nbsp;: un tableau des évaluations (apprenant, terme, oral, écrit, finale). Vous ne saisissez pas de note et n’imprimez pas de bulletin&nbsp;: c’est réservé à la direction.</p>
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
<li><p><b>Enseignants</b>&nbsp;: chacun est dans la liste, avec ses niveaux et ses certifications à jour (<a href="#q12">Q12</a>). Un nouvel enseignant se demande à la direction.</p>
</li>
<li><p><b>Groupes</b>&nbsp;: créez les groupes de la rentrée, avec enseignant, jours, horaire, salle, capacité et terme (<a href="#q8">Q8</a>).</p>
</li>
<li><p><b>Emploi du temps</b>&nbsp;: relisez la grille, aucun groupe ne manque (<a href="#q13">Q13</a>).</p>
</li>
<li><p><b>Pré-inscriptions</b>&nbsp;: traitez celles qui sont en attente (<a href="#q7">Q7</a>), et complétez les dossiers (<a href="#q2">Q2</a>).</p>
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
<li>Pré-inscriptions encore en attente (<a href="#q7">Q7</a>).</li>
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
<td><span className="ui">Autres actions</span> › <span className="ui">Attribuer un responsable</span>.</td>
</tr>
<tr>
<td>Prospect clôturé par erreur</td>
<td>Vous</td>
<td><span className="ui">Rouvrir le prospect</span>.</td>
</tr>
<tr>
<td>Mauvaise date de test ou de visite</td>
<td>Vous</td>
<td><span className="ui">Reprogrammer</span> (test) ou <span className="ui">Replanifier</span> (visite).</td>
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
<td>Pré-inscription créée par erreur</td>
<td><b>La direction</b></td>
<td>Vous ne pouvez pas la supprimer. Tant qu’elle n’est pas payée, elle n’engage rien.</td>
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
<td>Valider ou refuser une inscription</td>
<td><b>La direction</b></td>
<td>Ces boutons ne sont pas dans votre espace. De votre côté, la confirmation passe par le paiement.</td>
</tr>
<tr>
<td>Email d’un apprenant ou d’un parent à changer</td>
<td><b>La direction</b></td>
<td>Ces adresses servent à la connexion des familles.</td>
</tr>
<tr>
<td>Supprimer ou archiver un apprenant, supprimer un groupe, importer ou exporter les apprenants</td>
<td><b>La direction</b></td>
<td>Réservé aux responsables.</td>
</tr>
<tr>
<td>Ajouter ou archiver un enseignant</td>
<td><b>La direction</b></td>
<td>Pas de bouton dans votre espace (<a href="#q12">Q12</a>).</td>
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
<p>Page «&nbsp;Pipeline admissions&nbsp;». Vue <span className="ui">Tableau</span> (colonnes) ou <span className="ui">Liste</span>. Neuf vues&nbsp;: <b>Tous les prospects, Mes prospects, Nouveaux aujourd’hui, À traiter, Suivi aujourd’hui, Tests de niveau, Qualifiés, Sans réponse, Clôturés</b>.</p>
<ul className="tight">
<li>Recherche par nom du parent, de l’apprenant ou téléphone.</li>
<li>Filtres&nbsp;: responsable, canal, source, programme (et statut en liste).</li>
<li>Les filtres restent dans l’adresse&nbsp;: le bouton retour du navigateur ramène à la même liste.</li>
<li>25 prospects par page ou par colonne.</li>
</ul>
</div>
<div className="card">
<h4>Tâches</h4>
<p>Une ligne par tâche ouverte. Quatre onglets, heure de Casablanca. Se met à jour chaque minute.</p>
<ul className="tight">
<li><span className="ui">Résultat d’appel</span> pour les appels, <span className="ui">Terminer l’action</span> pour les autres tâches.</li>
<li><span className="ui">Replanifier</span>, <span className="ui">Voir le prospect</span>, et «&nbsp;Réattribuer l’action&nbsp;» dans le menu «&nbsp;…&nbsp;».</li>
<li>«&nbsp;Terminer l’action&nbsp;» demande un résultat (200 caractères) et une prochaine action.</li>
</ul>
</div>
<div className="card">
<h4>Tests de niveau</h4>
<p>Liste de tous les tests&nbsp;: apprenant, date, heure, examinateur, score, niveau, statut (<b>Planifié, Passé, Résultat saisi, Affecté</b>). Les tests liés à un prospect portent l’étiquette «&nbsp;Prospect CRM&nbsp;».</p>
<ul className="tight">
<li>Pas de suppression pour vous.</li>
<li><span className="ui">Planifier un test</span> crée un test sans lien avec un prospect, avec le niveau A1 proposé par défaut.</li>
</ul>
</div>
<div className="card">
<h4>Calendrier</h4>
<p>Tests «&nbsp;Planifié&nbsp;» et visites au centre ouvertes, jour par jour. Pas de glisser-déposer, pas de création depuis le calendrier.</p>
</div>
</div>
<h3>Partie 2 · Au quotidien</h3>
<div className="cols">
<div className="card">
<h4>Inscriptions</h4>
<p>Voir <a href="#q7">Q7</a>. Page «&nbsp;Pré-inscriptions&nbsp;»&nbsp;: seulement les pré-inscriptions (Submitted, Under Review, Trial, Rejected). Les inscriptions confirmées ou validées n’y figurent pas.</p>
<ul className="tight">
<li><span className="ui">Nouvelle inscription</span>&nbsp;: statut limité à Submitted, Under Review ou Trial. Une inscription «&nbsp;Trial&nbsp;» exige un groupe.</li>
<li>Pas de valider, refuser ni supprimer.</li>
<li>Les statuts et programmes sont affichés en anglais ici.</li>
</ul>
</div>
<div className="card">
<h4>Annuaire</h4>
<p>Voir <a href="#q1">Q1</a>. Cartes ou liste de tous les apprenants. <b>C’est le seul écran où la recherche trouve aussi un numéro de téléphone</b>, avec le nom et l’email. Sans pagination ni boutons d’action.</p>
</div>
<div className="card">
<h4>Liste des apprenants</h4>
<p>L’écran de travail&nbsp;: statut du dossier, paiement (Soldé, Acompte versé, En attente, En retard, Aucun engagement), groupe, niveau. 20 apprenants par page.</p>
<ul className="tight">
<li>La recherche porte sur le nom et l’email, pas sur le téléphone (alors que le champ dit «&nbsp;Nom ou téléphone&nbsp;»).</li>
<li>La catégorie d’âge se change directement dans la liste, sans confirmation.</li>
<li>Pas d’import, d’export ni d’archivage.</li>
</ul>
</div>
<div className="card">
<h4>Ajouter un apprenant</h4>
<p>Seul le <span className="ui">Nom complet</span> est obligatoire. L’apprenant est créé tout de suite avec le statut «&nbsp;Inscrit (dossier)&nbsp;», <b>sans inscription ni groupe</b>.</p>
<ul className="tight">
<li>Aucune détection de doublon&nbsp;: cherchez-le avant.</li>
<li>Après une erreur, un nouvel envoi peut créer un second apprenant&nbsp;: vérifiez la liste avant de recommencer.</li>
</ul>
</div>
<div className="card">
<h4>Fiche apprenant</h4>
<p>Niveau, taux de présence, solde actuel, situation des paiements, informations, inscriptions et groupes (avec <span className="ui">Ajouter un document</span>, 10 Mo, JPEG, PNG ou PDF), adultes autorisés au retrait, paiements historiques, notes.</p>
<ul className="tight">
<li>Les emails de l’apprenant et du parent sont en lecture seule pour vous.</li>
<li>Pas de bouton Archiver.</li>
</ul>
</div>
<div className="card">
<h4>Groupes &amp; niveaux</h4>
<p>Liste des groupes (session, niveau, enseignant, horaire, salle, terme). Vous pouvez créer et modifier un groupe, pas le supprimer. Un groupe a besoin d’un enseignant (<a href="#q8">Q8</a>).</p>
<p>Page d’un groupe&nbsp;: <span className="ui">Ajouter des apprenants</span> et <span className="ui">Retirer</span> (<a href="#q10">Q10</a>).</p>
<figure className="fig" style={{ marginBottom: '10px' }}>
<Image src="/helpdesk/s17-groups.jpg" width={1700} height={1075} alt="Liste des groupes et niveaux" unoptimized tabIndex={0} role="button" /></figure>
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
<p>Tableau des évaluations en lecture seule&nbsp;: apprenant, terme, oral, écrit, finale. Pas de saisie, pas de bulletin.</p>
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
<li>La note interne n’est pas lisible par vous après saisie.</li>
</ul>
<figure className="fig" style={{ marginBottom: '10px' }}>
<Image src="/helpdesk/s11a-receipts-list.jpg" width={1700} height={1075} alt="Liste des reçus de paiement" unoptimized tabIndex={0} role="button" /></figure>
</div>
<div className="card">
<h4>Enseignants</h4>
<p>Liste, profil et modification limitée&nbsp;: nom, téléphone, certifications et niveaux autorisés. L’email est en lecture seule. Aucun salaire ni contrat, et pas d’ajout d’enseignant (<a href="#q12">Q12</a>).</p>
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
<h3>Prospect, étape, tâche, historique</h3>
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
<td><b>Tâche</b></td>
<td>Ce qu’il faut faire ensuite, à quelle date. Elle se termine ou s’annule, et la plateforme en demande une nouvelle.</td>
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
<td>Une vraie conversation a eu lieu, le parent réfléchit ou veut être rappelé.</td>
</tr>
<tr>
<td><span className="st st-qual">Qualifié</span></td>
<td>Le projet est confirmé&nbsp;: test, visite ou inscription à préparer.</td>
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
<li><b>Soumise</b><small>pré-inscription créée</small></li>
<li><b>En cours d’examen</b><small>à l’étude</small></li>
<li><b>Inscrit — groupe à affecter</b><small>paiement reçu, pas de groupe</small></li>
<li><b>Inscription validée</b><small>groupe affecté</small></li>
</ol>
<p>«&nbsp;Essai&nbsp;» est une inscription à l’essai, avec groupe obligatoire. «&nbsp;Refusée&nbsp;» est décidée par la direction.</p>
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
<td>Soumise (pré-inscription créée)</td>
</tr>
<tr>
<td>Under Review</td>
<td>En cours d’examen</td>
</tr>
<tr>
<td>Trial</td>
<td>Essai</td>
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
<td>Refusée</td>
</tr>
<tr>
<td>Enrolled · Prospect · Inactive · Alumni</td>
<td>Inscrit (dossier) · Prospect · Inactif · Ancien apprenant</td>
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
<td>«&nbsp;Ce prospect a changé depuis son ouverture. Les informations sont actualisées.&nbsp;»</td>
<td>Quelqu’un d’autre a modifié la fiche. Relisez-la, puis refaites votre action.</td>
</tr>
<tr>
<td>«&nbsp;Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon.&nbsp;»</td>
<td>La connexion a coupé. Cliquez à nouveau sur <span className="ui">Enregistrer</span> sans rien changer.</td>
</tr>
<tr>
<td>«&nbsp;Cette heure convenue est hors des horaires d’appel.&nbsp;»</td>
<td>Choisissez avec le parent une autre heure, ou utilisez un rappel interne.</td>
</tr>
<tr>
<td>«&nbsp;Le délai minimum entre deux appels n’est pas encore écoulé.&nbsp;»</td>
<td>Attendez avant d’enregistrer un autre appel raté.</td>
</tr>
<tr>
<td>«&nbsp;Le calendrier de suivi n’est pas encore configuré. Demandez à un directeur de le publier.&nbsp;»</td>
<td>Prévenez la direction&nbsp;: sans horaires d’appel publiés, on ne peut pas créer de prospect.</td>
</tr>
<tr>
<td>«&nbsp;Cinq appels sans réponse dans la séquence actuelle sont nécessaires.&nbsp;»</td>
<td>Vous essayez de clôturer comme injoignable trop tôt. Continuez les appels.</td>
</tr>
<tr>
<td>«&nbsp;Un test est déjà prévu. Ouvrez-le pour le reprogrammer.&nbsp;»</td>
<td>Fiche › Test de niveau › <span className="ui">Reprogrammer</span>.</td>
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
<td>«&nbsp;Forbidden&nbsp;»</td>
<td>Vous n’avez pas le droit de faire cette action. Demandez à la direction.</td>
</tr>
<tr>
<td>«&nbsp;Only operational pre-enrollment is permitted&nbsp;» ou «&nbsp;Only group assignment is permitted&nbsp;»</td>
<td>Vous essayez de confirmer, valider ou modifier une inscription déjà confirmée. Seule l’affectation de groupe est possible pour vous.</td>
</tr>
</tbody>
</table>
</div>
<h3>Questions fréquentes</h3>
<details className="faq">
<summary>«&nbsp;Mes tâches&nbsp;» est vide, mais je sais qu’il y a du travail</summary>
<p>«&nbsp;Mes tâches&nbsp;» ne montre que les tâches qui vous sont attribuées. Les prospects créés à la main et les demandes des formulaires n’ont pas de responsable. Choisissez <span className="ui">Non attribué</span> ou <span className="ui">Toute l’équipe</span> dans <span className="ui">Responsable de la tâche</span>, ou attribuez-vous le prospect.</p>
</details>
<details className="faq">
<summary>Je ne trouve pas un apprenant avec son numéro de téléphone</summary>
<p>Dans <span className="menu">Liste des apprenants</span>, la recherche ne couvre pas le téléphone. Utilisez <span className="menu">Annuaire</span>, ou la recherche de <span className="menu">Nouveau reçu</span> (nom, téléphone, email de l’apprenant ou du parent). Dans <span className="menu">Opportunités</span>, la recherche accepte le téléphone des prospects.</p>
</details>
<details className="faq">
<summary>Un apprenant que je viens de créer n’apparaît pas dans la liste</summary>
<p>La liste affiche par défaut les «&nbsp;Dossiers actifs (inscrits, essai, anciens)&nbsp;». Un apprenant créé avec un paiement à 0 reste «&nbsp;Prospect&nbsp;» et est masqué&nbsp;: choisissez <span className="ui">Tous les statuts</span>.</p>
</details>
<details className="faq">
<summary>Le prospect est resté «&nbsp;Qualifié&nbsp;» alors que j’ai créé son inscription</summary>
<p>C’est voulu&nbsp;: la pré-inscription ne confirme rien. Le prospect passe en «&nbsp;Inscription confirmée&nbsp;» quand un paiement est enregistré sur son inscription (<a href="#c6">scénario C6</a>).</p>
</details>
<details className="faq">
<summary>Le bouton «&nbsp;Commencer l&apos;inscription&nbsp;» n’apparaît pas</summary>
<p>Il n’existe que pour un prospect «&nbsp;Qualifié&nbsp;» sans inscription. La fiche indique la raison en dessous&nbsp;: «&nbsp;Qualifiez le projet avant de commencer une inscription&nbsp;», ou «&nbsp;Rouvrez le prospect…&nbsp;» s’il est clôturé.</p>
</details>
<details className="faq">
<summary>Une carte déposée dans une autre colonne revient à sa place</summary>
<p>Déposer une carte n’enregistre rien&nbsp;: cela ouvre la fenêtre correspondante. L’étape ne change que si vous enregistrez un résultat. Certains déplacements (retour en arrière, vers «&nbsp;Inscription confirmée&nbsp;» sans inscription) ne sont pas pris en charge.</p>
</details>
<details className="faq">
<summary>Je ne vois pas les horaires d’appel</summary>
<p>Ils sont fixés par la direction et ne sont pas affichés dans votre espace. Demandez-les-lui. Les rappels internes sont décalés automatiquement&nbsp;; seuls les rappels «&nbsp;Rendez-vous convenu&nbsp;» doivent tomber dans les horaires.</p>
</details>
<details className="faq">
<summary>Je ne peux pas modifier l’email d’un apprenant</summary>
<p>C’est normal&nbsp;: cette adresse sert à la connexion des familles. Demandez à la direction.</p>
</details>
<details className="faq">
<summary>Un lien ou une page m’a renvoyée à «&nbsp;Pipeline admissions&nbsp;»</summary>
<p>La page n’est pas dans votre espace. Voir «&nbsp;Ce que vous ne verrez pas&nbsp;» plus haut.</p>
</details>
<details className="faq">
<summary>La date d’un test ou d’une inscription semble décalée d’un jour</summary>
<p>Dans les fenêtres de test de niveau et de pré-inscription, la date proposée par défaut peut être celle de la veille entre minuit et 1 h du matin. Vérifiez toujours la date avant d’enregistrer.</p>
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
<td>Archiver, importer, exporter, modifier le programme depuis la liste, changer les emails.</td>
</tr>
<tr>
<td>Académique</td>
<td>Supprimer un groupe, saisir des notes, imprimer des bulletins.</td>
</tr>
<tr>
<td>Enseignants</td>
<td>Contrats, salaires, congés, ajout ou archivage d’un enseignant.</td>
</tr>
<tr>
<td>Prospects</td>
<td>Horaires d’appel, analyse marketing, suivi Meta.</td>
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
<li>Appel ouvert ≠ appel enregistré&nbsp;: <span className="ui">Enregistrer</span>.</li>
<li>Conversation&nbsp;: choisir le <b>Résultat de l’échange</b>.</li>
<li>Pas de réponse&nbsp;: la plateforme planifie la suite (5 appels).</li>
<li>Prospect créé à la main&nbsp;: se l’attribuer.</li>
</ul>
</div>
<div className="card mini">
<h4>Test et visite</h4>
<ul className="tight">
<li>«&nbsp;Souhaite passer un test&nbsp;» ne réserve rien.</li>
<li><span className="ui">Réserver un test</span> depuis la fiche.</li>
<li>Pas d’annulation&nbsp;: <span className="ui">Reprogrammer</span>.</li>
<li>Visite&nbsp;: date et heure obligatoires.</li>
</ul>
</div>
<div className="card mini">
<h4>Inscrire</h4>
<ul className="tight">
<li><span className="ui">Commencer l&apos;inscription</span>&nbsp;: le prospect reste Qualifié.</li>
<li><span className="ui">Nouveau reçu</span>&nbsp;: choisir «&nbsp;Inscription CRM…&nbsp;».</li>
<li>Paiement &gt; 0&nbsp;: inscription confirmée.</li>
<li>Ensuite&nbsp;: <span className="ui">Groupe à affecter</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Au guichet</h4>
<ul className="tight">
<li><span className="menu">Nouveau reçu</span> › <span className="ui">Nouvel apprenant</span>.</li>
<li>Regarder «&nbsp;Dossiers ressemblants&nbsp;».</li>
<li>Montant 0 = pas de reçu, pas d’inscription.</li>
<li>Un reçu ne se modifie pas&nbsp;: direction.</li>
</ul>
</div>
<div className="card mini">
<h4>Un apprenant</h4>
<ul className="tight">
<li>Chercher dans l’<span className="menu">Annuaire</span>, même par téléphone.</li>
<li>Compléter&nbsp;: fiche › <span className="ui">Modifier</span>. Emails&nbsp;: direction.</li>
<li>Changer de groupe&nbsp;: <span className="ui">Modifier l’inscription</span>.</li>
</ul>
</div>
<div className="card mini">
<h4>Groupes et enseignants</h4>
<ul className="tight">
<li><span className="ui">Nouveau groupe</span>&nbsp;: l’enseignant est obligatoire.</li>
<li><span className="ui">Jours</span> alimente l’emploi du temps.</li>
<li>Nouvel enseignant&nbsp;: direction.</li>
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
<li>Paiement douteux&nbsp;: vérifier les reçus avant de ressaisir.</li>
<li>Page qui renvoie à l’accueil&nbsp;: hors de votre espace.</li>
<li>Sinon&nbsp;: contacter la direction.</li>
</ul>
</div>
</div>
</section>
<footer className="foot"><p>Guide Accueil, version 2.0, 16 octobre 2026. Il décrit la plateforme à cette date. Les captures montrent des données fictives. Signalez à la direction tout écart entre ce guide et l’écran.</p>
<a className="backtop" href="#prise-en-main">Retour en haut</a></footer>
    </>
  );
}
