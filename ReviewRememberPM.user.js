//==UserScript==
// @name         ReviewRememberPM
// @namespace    http://tampermonkey.net/
// @version      1.10.1
// @description  Outils pour les avis Amazon (version PickMe)
// @author       Créateur/Codeur principal : MegaMan / Codeur secondaire : Sulff
// @icon         https://vinepick.me/img/RR-ICO-2.png
// @match        https://www.amazon.fr/*
// @updateURL    https://raw.githubusercontent.com/teitong/reviewremember/main/ReviewRememberPM.user.js
// @downloadURL  https://raw.githubusercontent.com/teitong/reviewremember/main/ReviewRememberPM.user.js
// @require      https://vinepick.me/scripts/heic2any.min.js
// @grant        GM_registerMenuCommand
//==/UserScript==

(function() {

    'use strict';

    //Pour éviter la multi exécution
    if (window.__RR__) {
        return;
    }
    window.__RR__ = true;

    //A retirer plus tard, pour ne plus avoir l'alerte de RR à mettre à jour
    localStorage.setItem('useRR', '0');

    var versionRR = "1.10.1";

    const baseUrlPickme = "https://vinepick.me";

    const selectorTitle = 'reviewTitle';
    const selectorReview = 'reviewText';
    const selectorButtons = '.in-context-ryp__form_fields_container-desktop, .in-context-ryp__form_fields_container-mweb';

    const selectorTitleOld = 'scarface-review-title-label';
    const selectorReviewOld = 'scarface-review-text-card-title';
    const selectorButtonsOld = '.ryp__submit-button-card__card-frame';

    var reviewColor = localStorage.getItem('reviewColor');

    // Fonction pour détecter si l'utilisateur est sur mobile (à ne pas confondre avec le mode mobile activable manuellement
    // dans les paramètres utilisateur)
    // Note : si le mode PC est forcé sur mobile, cette fonction renverra toujours false, ce qui est le comportement attendu,
    // car les traitements spécifiques au PC s'exécuteront, et la structure HTML liée sera présente
    // => Cette fonction ne devrait pas poser de problème de fonctionnement si le mode PC est forcé sur mobile
    function isMobile() {
        return document.documentElement.classList.contains('a-mobile');
    }

    //Fonction pour obtenir l'ASIN du produit à partir de l'URL
    function getASIN() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('asin');
    }

    //Analyse une date JJ/MM/AAAA ou avec mois en français
    function parseDDMMYYYYFlexible(s) {
        const txt = (s || '').toString().replace(/\u00a0/g, ' ').trim();

        let m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
            const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
            if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 2000 && yyyy <= 2100) {
                const dt = new Date(yyyy, mm - 1, dd);
                const ts = dt.getTime();
                if (Number.isFinite(ts)) {
                    return { ts: dt.setHours(0, 0, 0, 0), str: `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${yyyy}` };
                }
            }
        }

        const months = {
            'janv':1,'janvier':1,'févr':2,'fevr':2,'février':2,'fevrier':2,'mars':3,'avr':4,'avril':4,
            'mai':5,'juin':6,'juil':7,'juillet':7,'août':8,'aout':8,'sept':9,'septembre':9,
            'oct':10,'octobre':10,'nov':11,'novembre':11,'déc':12,'dec':12,'décembre':12,'decembre':12
        };

        m = txt.match(/(\d{1,2})\s+([a-zA-Zéèêëàâäîïôöûüç\.]+)\s+(\d{4})/);
        if (!m) return null;

        const dd = Number(m[1]);
        const monRaw = (m[2] || '').toLowerCase().replace(/\./g, '').trim();
        const yyyy = Number(m[3]);
        const mm = months[monRaw];

        if (!mm || !(dd >= 1 && dd <= 31 && yyyy >= 2000 && yyyy <= 2100)) return null;

        const dt = new Date(yyyy, mm - 1, dd);
        const ts = dt.getTime();
        if (!Number.isFinite(ts)) return null;

        return { ts: dt.setHours(0, 0, 0, 0), str: `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${yyyy}` };
    }

    //Export des avis
    function exportReviewsToCSV() {
        let csvContent = "\uFEFF"; // BOM pour UTF-8

        //Ajouter l'en-tête du CSV
        csvContent += "Date;Type;Nom;ASIN;Evaluation;Titre de l'avis;Contenu de l'avis\n";

        //Exporter les modèles
        let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
        savedTemplates.forEach(template => {
            const { name, title, review } = template;
            //Ajoute une ligne détaillée pour chaque modèle avec une colonne vide pour ASIN et Evaluation
            csvContent += `;Modèle;${name};;;${title.replace(/;/g, ',')};${review.replace(/\n/g, '\\n')}\n`;
        });

        //Itérer sur les éléments de localStorage
        Object.keys(localStorage).forEach(function(key) {
            if (key.startsWith('review_') && key !== 'review_templates') {
                const reviewData = JSON.parse(localStorage.getItem(key));
                const asin = key.replace('review_', ''); //Extraire l'ASIN
                const name = reviewData.name ? reviewData.name.replace(/;/g, ',') : '';
                const title = reviewData.title.replace(/;/g, ','); //Remplacer les ";" par des ","
                const review = reviewData.review.replace(/\n/g, '\\n');
                const evaluation = reviewData.evaluation ? reviewData.evaluation.replace(/;/g, ',') : '';
                const date = reviewData.date || '';

                //Ajouter la ligne pour les avis
                csvContent += `${date};Avis;${name};${asin};${evaluation};${title};${review}\n`;
            }
        });

        //Créer un objet Blob avec le contenu CSV en spécifiant le type MIME
        var blob = new Blob([csvContent], {type: "text/csv;charset=utf-8;"});
        var url = URL.createObjectURL(blob);

        //Créer un lien pour télécharger le fichier
        var link = document.createElement("a");
        link.setAttribute("href", url);
        const now = new Date();
        const formattedDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        link.setAttribute("download", `RR_backup_${formattedDate}.csv`);
        document.body.appendChild(link); //Nécessaire pour certains navigateurs

        //Simuler un clic sur le lien pour déclencher le téléchargement
        link.click();

        //Nettoyer en supprimant le lien et en libérant l'objet URL
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    //Import d'un fichier CSV
    function readAndImportCSV(file) {
        const reader = new FileReader();

        reader.onload = function(event) {
            const csv = event.target.result;
            const lines = csv.split('\n');

            for (let i = 1; i < lines.length; i++) {
                if (lines[i]) {
                    const columns = lines[i].split(';');
                    if (columns.length >= 5) {
                        const date = (columns[0] || '').trim();
                        const type = (columns[1] || '').trim();
                        const name = (columns[2] || '').trim();
                        const asin = (columns[3] || '').trim();
                        const evaluation = (columns[4] || '').trim();
                        const title = (columns[5] || '').trim();
                        const review = (columns[6] || '').trim().replace(/\\n/g, '\n');

                        if (type === "Avis") {
                            const reviewData = { title, review, date };
                            if (name) {
                                reviewData.name = name;
                            }
                            if (evaluation) {
                                reviewData.evaluation = evaluation;
                            }
                            localStorage.setItem(`review_${asin}`, JSON.stringify(reviewData));
                        } else if (type === "Modèle") {
                            let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
                            const existingIndex = savedTemplates.findIndex(template => template.name === name);
                            const templateData = { name, title, review };

                            if (existingIndex !== -1) {
                                savedTemplates[existingIndex] = templateData;
                            } else {
                                savedTemplates.push(templateData);
                            }

                            localStorage.setItem('review_templates', JSON.stringify(savedTemplates));
                        }
                    }
                }
            }

            alert('Importation terminée.');
        };

        reader.readAsText(file, 'UTF-8');
    }

    //Ajout du menu
    function setHighlightColor() {
        //Extraire les composantes r, g, b de la couleur actuelle
        const rgbaMatch = reviewColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+),\s*(\d*\.?\d+)\)$/);
        let hexColor = "#FFFF00"; //Fallback couleur jaune si la conversion échoue
        if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
            hexColor = `#${r}${g}${b}`;
        }

        //Vérifie si une popup existe déjà et la supprime si c'est le cas
        const existingPopup = document.getElementById('colorPickerPopup');
        if (existingPopup) {
            existingPopup.remove();
        }

        //Crée la fenêtre popup
        const popup = document.createElement('div');
        popup.id = "colorPickerPopup";
        /*popup.style.cssText = `
        position: fixed;
        z-index: 10002;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background-color: white;
        border: 1px solid #ccc;
        box-shadow: 0px 0px 10px #ccc;
    `;*/
        popup.innerHTML = `
          <h2 id="configPopupHeader">Couleur de la bordure des avis utiles<span id="closeColorPicker" style="float: right; cursor: pointer;">&times;</span></h2>
        <input type="color" id="colorPicker" value="${hexColor}" style="width: 100%;">
        <div class="button-container final-buttons">
            <button class="full-width" id="saveColor">Enregistrer</button>
            <button class="full-width" id="closeColor">Fermer</button>
        </div>
    `;

        document.body.appendChild(popup);

        //Ajoute des écouteurs d'événement pour les boutons
        document.getElementById('saveColor').addEventListener('click', function() {
            const selectedColor = document.getElementById('colorPicker').value;
            //Convertir la couleur hexadécimale en RGBA pour la transparence
            const r = parseInt(selectedColor.substr(1, 2), 16);
            const g = parseInt(selectedColor.substr(3, 2), 16);
            const b = parseInt(selectedColor.substr(5, 2), 16);
            const rgbaColor = `rgba(${r}, ${g}, ${b}, 0.5)`;

            //Stocker la couleur sélectionnée
            localStorage.setItem('reviewColor', rgbaColor);
            reviewColor = rgbaColor;
            popup.remove();
        });

        document.getElementById('closeColor').addEventListener('click', function() {
            popup.remove();
        });
        document.getElementById('closeColorPicker').addEventListener('click', function() {
            popup.remove();
        });
    }

    //Création de la popup pour les raisons de refus
    function createEmailPopup() {
        if (document.getElementById('emailTemplates')) {
            return; //Termine la fonction pour éviter de créer une nouvelle popup
        }
        //Création de la popup
        const popup = document.createElement('div');
        popup.id = "emailPopup";
        /* popup.style.cssText = `
        position: fixed;
        z-index: 10002;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background-color: white;
        border: 1px solid #ccc;
        box-shadow: 0px 0px 10px #ccc;
    `;*/
        popup.innerHTML = `
<div id="emailConfigPopup">
<div style="position: relative;">
    <h2 id="emailPopupHeader" style="text-align: center;">Configuration des Emails</h2>
    <span id="closeEmailPopup" style="position: absolute; right: 10px; top: 10px; cursor: pointer;">&times;</span>
</div>
<div id="emailTemplates" style="display: flex; flex-direction: column; align-items: center;">
    <h3>Modèles existants</h3>
    <select id="existingTemplates" style="margin-bottom: 10px;margin-top: 10px;"></select>
<div style="display: flex; flex-direction: row; align-items: center; width: 100%;">
    <button id="loadTemplateButton" class="button-container action-buttons" style="text-align: center; margin-right: 10px; display: flex; align-items: center; justify-content: center;">Charger le modèle</button>
    <button id="loadMultiProductTemplateButton" class="button-container action-buttons" style="text-align: center; display: flex; align-items: center; justify-content: center;">Charger le modèle multiproduits</button>
</div>
</div>
<div id="templateDetails">
    <h3 id="templateActionTitle" style="text-align: center;">Ajouter un nouveau modèle</h3>
    <input type="text" id="templateTitle" placeholder="Titre du modèle" style="margin-right: 10px; margin-bottom: 10px; margin-top: 10px;" />
    <span id="helpIcon" style="cursor: pointer; font-size: 15px; user-select: none;">?</span>
    <textarea id="templateText" placeholder="Texte du modèle" rows="10"></textarea>
    <div class="button-container action-buttons">
    <button id="saveTemplateButton" class="full-width">Ajouter</button>
    <button id="closeEmailConfig" class="full-width">Fermer</button>
    <button id="deleteTemplateButton" class="full-width" style="display:none; text-align: center;margin-top: 10px">Supprimer</button>
    </div>
</div>
</div>
`;

        document.body.appendChild(popup);

        document.getElementById('helpIcon').addEventListener('click', function() {
            alert('Informations sur la rédaction des modèles.\n\n' +
                  'Liste des variables qui seront remplacées lors de la génération du mail :\n' +
                  '- $asin : ASIN du produit\n' +
                  '- $order : numéro de commande\n' +
                  '- $reason : raison de la suppression\n' +
                  '- $nom : nom du produit\n' +
                  '- $date : date de la commande\n\n' +
                  'Sur le mail multiproduits, les balises $debut et $fin délimitent la zone de texte qui sera générée pour chaque produit.\n\n' +
                  'Le titre du modèle servira aussi de raison de suppression lors de la génération multiproduits ($reason).');
        });

        //Boutons et leurs événements
        document.getElementById('closeEmailPopup').addEventListener('click', () => popup.remove());
        document.getElementById('closeEmailConfig').addEventListener('click', () => popup.remove());
        document.getElementById('saveTemplateButton').addEventListener('click', saveEmailTemplate);
        document.getElementById('loadTemplateButton').addEventListener('click', loadSelectedTemplate);
        document.getElementById('deleteTemplateButton').addEventListener('click', deleteSelectedTemplate);
        document.getElementById('loadMultiProductTemplateButton').addEventListener('click', loadMultiProductTemplate);

        //Charger les modèles existants dans la liste déroulante
        loadEmailTemplatesDropdown();
    }

    function loadMultiProductTemplate() {
        const multiProductTemplateKey = 'multiProductEmailTemplate';
        //Charger le modèle multiproduits ou initialiser avec le modèle par défaut
        let multiProductTemplate = JSON.parse(localStorage.getItem(multiProductTemplateKey));
        if (!multiProductTemplate) {
            initmultiProductTemplate();
        }

        //Remplissez les champs avec les données du modèle multiproduits
        document.getElementById('templateTitle').value = multiProductTemplate.title;
        document.getElementById('templateText').value = multiProductTemplate.text;

        //Changez l'interface pour refléter que l'utilisateur modifie le modèle multiproduits
        document.getElementById('templateActionTitle').innerText = 'Modifier le modèle multiproduits';
        document.getElementById('saveTemplateButton').innerText = 'Enregistrer';
        document.getElementById('deleteTemplateButton').style.display = 'none'; //Cache le bouton supprimer car ce modèle ne peut pas être supprimé

        //Stockez l'index ou la clé du modèle multiproduits
        selectedTemplateIndex = multiProductTemplateKey; //Utilisez une clé spéciale ou un index pour identifier le modèle multiproduits
    }

    function initmultiProductTemplate() {
        const multiProductTemplateKey = 'multiProductEmailTemplate';
        const defaultMultiProductTemplate = {
            title: 'Mail multiproduits',
            text: 'Bonjour,\n\nVoici une liste de commande à supprimer de mes avis :\n$debut\nASIN : $asin\nCommande : $order\nRaison : $raison\n$fin\nCordialement.'
        };
        const multiProductTemplate = defaultMultiProductTemplate;
        localStorage.setItem(multiProductTemplateKey, JSON.stringify(multiProductTemplate));
    }

    function loadEmailTemplatesDropdown() {
        //Charger la liste des modèles existants dans la liste déroulante
        const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
        const templatesDropdown = document.getElementById('existingTemplates');
        templatesDropdown.innerHTML = templates.map((template, index) =>
                                                    `<option value="${index}">${template.title}</option>`
                                                   ).join('');
        templatesDropdown.selectedIndex = -1; //Aucune sélection par défaut
    }

    function addEmailTemplate() {
        const title = document.getElementById('newTemplateTitle').value;
        const text = document.getElementById('newTemplateText').value;
        if (title && text) {
            const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
            templates.push({ title, text });
            localStorage.setItem('emailTemplates', JSON.stringify(templates));
            loadEmailTemplates(); //Recharger la liste des modèles
        } else {
            alert('Veuillez remplir le titre et le texte du modèle.');
        }
    }

    function loadSelectedTemplate() {
        const selectedIndex = document.getElementById('existingTemplates').value;
        if (selectedIndex !== null) {
            const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
            const selectedTemplate = templates[selectedIndex];
            document.getElementById('templateTitle').value = selectedTemplate.title;
            document.getElementById('templateText').value = selectedTemplate.text;
            selectedTemplateIndex = selectedIndex; //Mettre à jour l'index sélectionné

            //Mettre à jour les textes des boutons et afficher le bouton Supprimer
            document.getElementById('templateActionTitle').innerText = 'Modifier le modèle';
            document.getElementById('saveTemplateButton').innerText = 'Enregistrer';
            document.getElementById('deleteTemplateButton').style.display = 'inline';
        }
    }

    function loadEmailTemplates() {
        const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
        const templatesContainer = document.getElementById('existingTemplates');
        templatesContainer.innerHTML = '';
        templates.forEach((template, index) => {
            const templateDiv = document.createElement('div');
            templateDiv.className = 'template-entry';
            templateDiv.dataset.index = index;
            templateDiv.innerHTML = `
<b>${template.title}</b>
<p>${template.text}</p>
`;
            templateDiv.onclick = function() {
                selectTemplate(this);
            }
            templatesContainer.appendChild(templateDiv);
        });
    }

    function selectTemplate(element) {
        //Désélectionner le précédent élément sélectionné
        document.querySelectorAll('.template-entry.selected').forEach(e => e.classList.remove('selected'));

        //Sélectionner le nouvel élément
        element.classList.add('selected');
        selectedTemplateIndex = parseInt(element.dataset.index);

        //Remplir les champs de modification avec les données du modèle sélectionné
        const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
        if (templates[selectedTemplateIndex]) {
            document.getElementById('editTemplateTitle').value = templates[selectedTemplateIndex].title;
            document.getElementById('editTemplateText').value = templates[selectedTemplateIndex].text;
        }
    }

    function saveEmailTemplate() {
        const title = document.getElementById('templateTitle').value;
        const text = document.getElementById('templateText').value;
        const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');

        if (title.trim() === '' || text.trim() === '') {
            alert('Le titre et le texte du modèle ne peuvent pas être vides.');
            return;
        }
        if (selectedTemplateIndex === 'multiProductEmailTemplate') { //Si le modèle multiproduits est en cours de modification
            const title = document.getElementById('templateTitle').value;
            const text = document.getElementById('templateText').value;
            const multiProductTemplate = { title, text };
            localStorage.setItem('multiProductEmailTemplate', JSON.stringify(multiProductTemplate));
        } else if (selectedTemplateIndex !== null) { //Si un modèle est sélectionné, le mettre à jour
            templates[selectedTemplateIndex] = { title, text };
            selectedTemplateIndex = null; //Réinitialiser l'index sélectionné après la sauvegarde
        } else { //Sinon, ajouter un nouveau modèle
            templates.push({ title, text });
        }

        localStorage.setItem('emailTemplates', JSON.stringify(templates));
        loadEmailTemplatesDropdown(); //Recharger la liste déroulante

        clearTemplateFields(); //Fonction pour vider les champs
    }

    function clearTemplateFields() {
        //Vider les champs de saisie et réinitialiser les libellés des boutons
        document.getElementById('templateTitle').value = '';
        document.getElementById('templateText').value = '';
        document.getElementById('templateActionTitle').innerText = 'Ajouter un nouveau modèle';
        document.getElementById('saveTemplateButton').innerText = 'Ajouter';
        document.getElementById('deleteTemplateButton').style.display = 'none';

        //Réinitialiser l'index sélectionné
        selectedTemplateIndex = null;
    }

    function deleteSelectedTemplate() {
        if (selectedTemplateIndex !== null && confirm('Êtes-vous sûr de vouloir supprimer ce modèle ?')) {
            const templates = JSON.parse(localStorage.getItem('emailTemplates') || '[]');
            templates.splice(selectedTemplateIndex, 1);
            localStorage.setItem('emailTemplates', JSON.stringify(templates));
            loadEmailTemplatesDropdown(); //Recharger la liste déroulante

            clearTemplateFields(); //Fonction pour vider les champs
        }
    }
    let selectedTemplateIndex = null; //Index du modèle sélectionné

    const styleMenu = document.createElement('style');
    styleMenu.type = 'text/css';
    styleMenu.innerHTML = `
#configPopupRR, #colorPickerPopup, #emailConfigPopup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10003;
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  width: 500px; /* Ajusté pour mieux s'adapter aux deux colonnes de checkbox */
  display: flex;
  flex-direction: column;
  align-items: stretch;
  cursor: auto;
  border: 2px solid #ccc; /* Ajout d'un contour */
  overflow: auto; /* Ajout de défilement si nécessaire */
  resize: both; /* Permet le redimensionnement horizontal et vertical */
}

#configPopupRR h2, #configPopupRR label {
  color: #333;
  margin-bottom: 20px;
}

#configPopupRR h2, #colorPickerPopup h2 {
  cursor: grab;
  font-size: 1.5em;
  text-align: center;
}

#configPopupRR label {
  display: flex;
  align-items: center;
}

#configPopupRR label input[type="checkbox"] {
  margin-right: 10px;
}

#configPopupRR .button-container,
#emailConfigPopup .button-container,
#configPopupRR .checkbox-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

#configPopupRR .button-container button,
#emailConfigPopup .button-container,
#configPopupRR .checkbox-container label {
  margin-bottom: 10px;
  flex-basis: 48%; /* Ajusté pour uniformiser l'apparence des boutons et des labels */
}

#configPopupRR button,
#emailConfigPopup button {
  padding: 5px 10px;
  background-color: #f3f3f3;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
}

#configPopupRR button:not(.full-width), #colorPickerPopup button:not(.full-width), #emailConfigPopup button:not(.full-width) {
  margin-right: 1%;
  margin-left: 1%;
}

#configPopupRR button.full-width, #colorPickerPopup button.full-width, #emailConfigPopup button.full-width {
  flex-basis: 48%;
  margin-right: 1%;
  margin-left: 1%;
}

#configPopupRR button:hover,
#emailConfigPopup button:hover {
  background-color: #e8e8e8;
}

#configPopupRR button:active,
#emailConfigPopup button:active {
  background-color: #ddd;
}
#configPopupRR label.disabled {
  color: #ccc;
}

#configPopupRR label.disabled input[type="checkbox"] {
  cursor: not-allowed;
}
#saveConfigRR, #closeConfigRR, #saveColor, #closeColor, #saveTemplateButton, #closeEmailConfig, #deleteTemplateButton {
  padding: 8px 15px !important; /* Plus de padding pour un meilleur visuel */
  margin-top !important: 5px;
  border-radius: 5px !important; /* Bordures légèrement arrondies */
  font-weight: bold !important; /* Texte en gras */
  border: none !important; /* Supprime la bordure par défaut */
  color: white !important; /* Texte en blanc */
  cursor: pointer !important;
  transition: background-color 0.3s ease !important; /* Transition pour l'effet au survol */
}

#saveConfigRR, #saveColor, #saveTemplateButton {
  background-color: #4CAF50 !important; /* Vert pour le bouton "Enregistrer" */
}

#closeConfigRR, #closeColor, #closeEmailConfig, #deleteTemplateButton {
  background-color: #f44336 !important; /* Rouge pour le bouton "Fermer" */
}

#saveConfig:hover, #saveColor:hover, #saveTemplateButton:hover {
  background-color: #45a049 !important; /* Assombrit le vert au survol */
}

#closeConfigRR:hover, #closeColor:hover, #closeEmailConfig:hover, #deleteTemplateButton:hover {
  background-color: #e53935 !important; /* Assombrit le rouge au survol */
}
#saveColor, #closeColor, #closeEmailConfig, #saveTemplateButton, #deleteTemplateButton {
  margin-top: 10px; /* Ajoute un espace de 10px au-dessus du second bouton */
  width: 100%; /* Utilise width: 100% pour assurer que le bouton prend toute la largeur */
}

#existingTemplates {
    border: 1px solid #ccc;
    padding: 4px;
    margin-top: 10px;
    margin-bottom: 10px;
    background-color: white;
    width: auto; /* ou une largeur spécifique selon votre design */
}
/* Quand un bouton est seul sur une ligne */
/*
#reviewColor {
  flex-basis: 100% !important; /* Prend la pleine largeur pour forcer à aller sur une nouvelle ligne */
  margin-right: 1% !important; /* Annuler la marge droite si elle est définie ailleurs */
  margin-left: 1% !important; /* Annuler la marge droite si elle est définie ailleurs */
}*/
`;
    document.head.appendChild(styleMenu);

    //Fonction pour afficher une boîte de dialogue pour définir le pourcentage cible
    function promptForTargetPercentage() {
        const storedValue = localStorage.getItem('gestavisTargetPercentage');
        const targetPercentage = prompt('Entrez le pourcentage cible à atteindre (entre 60 et 100):', storedValue);
        if (targetPercentage !== null) {
            const parsedValue = parseFloat(targetPercentage);
            if (!isNaN(parsedValue) && parsedValue >= 60 && parsedValue <= 100) {
                localStorage.setItem('gestavisTargetPercentage', parsedValue);
            } else {
                alert('Pourcentage invalide. Veuillez entrer un nombre entre 60 et 100.');
            }
        }
    }

    //Fonction pour rendre la fenêtre déplaçable
    function dragElement(elmnt) {
        var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        if (document.getElementById(elmnt.id + "Header")) {
            //si présent, le header est l'endroit où vous pouvez déplacer la DIV:
            document.getElementById(elmnt.id + "Header").onmousedown = dragMouseDown;
        } else {
            //sinon, déplace la DIV de n'importe quel endroit à l'intérieur de la DIV:
            elmnt.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            //position de la souris au démarrage:
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            //appelle la fonction chaque fois que le curseur bouge:
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            //calcule la nouvelle position de la souris:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            //définit la nouvelle position de l'élément:
            elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
            elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            //arrête le mouvement quand le bouton de la souris est relâché:
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function deleteAllTemplates() {
        localStorage.removeItem('review_templates');
        alert('Tous les modèles ont été supprimés.');
    }

    //Supprimer les avis
    function deleteAllReviews() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('review_') && key !== 'review_templates') {
                localStorage.removeItem(key);
            }
        });
        alert('Tous les avis ont été supprimés.');
    }

    //Fonction pour recharger les boutons
    function reloadButtons() {
        //Supprime les boutons existants
        document.querySelectorAll('.custom-button-container').forEach(container => container.remove());
        //Ajoute les boutons à nouveau
        const submitButtonArea =
              document.querySelector(selectorButtons) ||
              document.querySelector(selectorButtonsOld);
        if (submitButtonArea) {
            addButtons(submitButtonArea);
        }
    }

    //Fonction pour sauvegarder un nouveau modèle ou écraser un existant
    function saveTemplate() {
        const name = prompt("Entrez un nom pour ce modèle :");
        if (!name) {
            return alert('Le nom du modèle ne peut pas être vide.');
        }
        //Si null ou undefined, on utilise selectorTitleOld
        const titleElement = document.getElementById(selectorTitle)
        || document.getElementById(selectorTitleOld);

        const reviewElement = document.getElementById(selectorReview)
        || document.getElementById(selectorReviewOld);

        //On vérifie l'existence de titleElement avant de l'utiliser
        if (titleElement) {
            var title = titleElement.value;
        }

        if (reviewElement) {
            var review = reviewElement.value;
        }

        let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];

        const existingIndex = savedTemplates.findIndex(template => template.name === name);

        if (existingIndex !== -1) {
            //Confirmer l'écrasement si le nom du modèle existe déjà
            if (confirm(`Le modèle "${name}" existe déjà. Voulez-vous le remplacer ?`)) {
                savedTemplates[existingIndex] = { name, title, review };
            }
        } else {
            //Ajouter un nouveau modèle
            savedTemplates.push({ name, title, review });
        }

        localStorage.setItem('review_templates', JSON.stringify(savedTemplates));
        alert(`Le modèle "${name}" a été sauvegardé.`);
        reloadButtons();
    }

    //Fonction pour supprimer un modèle
    function deleteTemplate(index) {
        let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
        if (savedTemplates[index]) {
            if (confirm(`Voulez-vous vraiment supprimer le modèle "${savedTemplates[index].name}" ?`)) {
                savedTemplates.splice(index, 1);
                localStorage.setItem('review_templates', JSON.stringify(savedTemplates));
                reloadButtons(); //Actualise les boutons et la liste de sélection
            }
        }
    }

    //Fonction de nettoyage qui supprime l'intervalle, les écouteurs, le message, etc...
    function cleanupPreviousRun() {
        const data = window._fcrData;
        if (!data) return;

        //Supprimer l'intervalle s'il existe
        if (data.hideInterval) {
            clearInterval(data.hideInterval);
            data.hideInterval = null;
        }
        //Supprimer les écouteurs sur les champs
        if (data.reviewTextarea && data.onChangeReview) {
            data.reviewTextarea.removeEventListener('input', data.onChangeReview);
        }
        if (data.reviewTitle && data.onChangeTitle) {
            data.reviewTitle.removeEventListener('input', data.onChangeTitle);
        }
        //Supprimer le message rouge (s'il existe encore)
        if (data.message && data.message.parentNode) {
            data.message.parentNode.removeChild(data.message);
        }
        //Rétablir l'affichage par défaut du conteneur
        if (data.boutonContainer) {
            data.boutonContainer.style.removeProperty('display');
        }
        window._fcrData = null;
    }

    //Ajoute un seul bouton au conteneur spécifié avec une classe optionnelle pour le style
    function addButton(text, onClickFunction, container, className = '') {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'a-button a-button-normal a-button-primary custom-button ' + className;
        button.addEventListener('click', function() {
            onClickFunction.call(this);
        });
        container.appendChild(button);
        return button;
    }

    function forceChangeReview() {
        //Si on a déjà lancé la fonction auparavant, on nettoie d'abord
        if (window._fcrData) {
            cleanupPreviousRun();
        }

        const reviewTextarea = document.getElementById(selectorReview);
        const reviewTitle = document.getElementById(selectorTitle);
        const boutonContainer = document.querySelector('.in-context-ryp__submit-button-frame-desktop');

        if (!reviewTextarea || !reviewTitle || !boutonContainer) {
            console.log("[ReviewRemember] Impossible de trouver reviewTextarea, reviewTitle ou boutonContainer.");
            return;
        }

        //On crée un objet où on stocke nos références
        window._fcrData = {
            reviewTextarea: reviewTextarea,
            reviewTitle: reviewTitle,
            boutonContainer: boutonContainer,
            hideInterval: null,
            message: null,
            onChangeReview: null,
            onChangeTitle: null,
            hasRun: true
        };

        //Valeurs initiales
        const initialReview = reviewTextarea.value;
        const initialTitle = reviewTitle.value;

        //Création du message
        const message = document.createElement('p');
        message.style.color = 'red';
        message.style.fontWeight = 'bold';
        message.style.marginTop = '8px';
        message.style.marginBottom = '8px';

        //On l'insère après le bouton
        boutonContainer.insertAdjacentElement('afterend', message);
        window._fcrData.message = message;

        //On cache immédiatement le conteneur
        boutonContainer.style.setProperty('display', 'none', 'important');

        //Timer car Amazon garde pas la propriété none sinon
        let hideInterval = setInterval(() => {
            boutonContainer.style.setProperty('display', 'none', 'important');
        }, 500);
        window._fcrData.hideInterval = hideInterval;

        let changedReview = false;
        let changedTitle = false;

        function checkIfBothChanged() {
            //Si les deux champs ont été modifiés
            if (changedReview && changedTitle) {
                //On arrête le masquage
                if (window._fcrData.hideInterval) {
                    clearInterval(window._fcrData.hideInterval);
                    window._fcrData.hideInterval = null;
                }
                boutonContainer.style.removeProperty('display');
                message.textContent = "";

                //On supprime les écouteurs
                reviewTextarea.removeEventListener('input', onChangeReview);
                reviewTitle.removeEventListener('input', onChangeTitle);
            } else {
                //On indique ce qu'il manque à modifier
                const missing = [];
                if (!changedReview) missing.push("votre avis");
                if (!changedTitle) missing.push("le titre de l'avis");
                message.textContent = "Pour envoyer l'avis, veuillez modifier : " + missing.join(" et ");
            }
        }

        function onChangeReview() {
            //S'il n'est pas encore modifié, on compare à la valeur initiale
            if (!changedReview && reviewTextarea.value !== initialReview) {
                changedReview = true;
            }
            checkIfBothChanged();
        }

        function onChangeTitle() {
            if (!changedTitle && reviewTitle.value !== initialTitle) {
                changedTitle = true;
            }
            checkIfBothChanged();
        }

        //On garde la référence pour pouvoir les enlever plus tard
        window._fcrData.onChangeReview = onChangeReview;
        window._fcrData.onChangeTitle = onChangeTitle;

        reviewTextarea.addEventListener('input', onChangeReview);
        reviewTitle.addEventListener('input', onChangeTitle);

        //Vérification initiale
        checkIfBothChanged();
    }

    //Fonction pour utiliser un modèle spécifique
    function useTemplate(index) {
        const savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
        const template = savedTemplates[index];
        if (template) {
            //Si null ou undefined, on utilise selectorTitleOld
            const titleElement = document.getElementById(selectorTitle)
            || document.getElementById(selectorTitleOld);

            const reviewElement = document.getElementById(selectorReview)
            || document.getElementById(selectorReviewOld);

            //On vérifie l'existence de titleElement avant de l'utiliser
            if (titleElement) {
                titleElement.value = template.title;
            }

            if (reviewElement) {
                reviewElement.value = template.review;
            }
            forceChangeReview();
        } else {
            alert('Aucun modèle sélectionné.');
        }
    }

    //Fonction pour restaurer un avis
    function restoreReview() {
        const asin = getASIN();
        const savedReview = JSON.parse(localStorage.getItem(`review_${asin}`));
        if (savedReview) {
            //Si null ou undefined, on utilise selectorTitleOld
            const titleElement = document.getElementById(selectorTitle)
            || document.getElementById(selectorTitleOld);

            const reviewElement = document.getElementById(selectorReview)
            || document.getElementById(selectorReviewOld);

            //On vérifie l'existence de titleElement avant de l'utiliser
            if (titleElement) {
                titleElement.value = savedReview.title;
            }

            if (reviewElement) {
                reviewElement.value = savedReview.review;
            }
            forceChangeReview();
        } else {
            alert('Aucun avis sauvegardé pour ce produit.');
        }
    }

    //Fonction pour sauvegarder l'avis
    function saveReview(autoSave = false) {
        //Si null ou undefined, on utilise selectorTitleOld
        const titleElement = document.getElementById(selectorTitle)
        || document.getElementById(selectorTitleOld);

        const reviewElement = document.getElementById(selectorReview)
        || document.getElementById(selectorReviewOld);

        //On vérifie l'existence de titleElement avant de l'utiliser
        if (titleElement) {
            var title = titleElement.value;
        }

        if (reviewElement) {
            var review = reviewElement.value;
        }

        const asin = getASIN();
        const storageKey = `review_${asin}`;
        const storedValue = localStorage.getItem(storageKey);
        let existingData = {};
        if (storedValue) {
            try {
                existingData = JSON.parse(storedValue);
            } catch (error) {
                console.error("[ReviewRemember] Impossible d'analyser les données existantes pour l'ASIN :", asin, error);
            }
        }

        //Obtenir la date au format JJ/MM/AAAA uniquement si aucune date n'est déjà stockée
        if (!existingData.date) {
            const now = new Date();
            existingData.date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        }

        const updatedReview = {
            ...existingData,
            title,
            review
        };

        //Sauvegarde dans localStorage
        localStorage.setItem(storageKey, JSON.stringify(updatedReview));
        if (!autoSave) {
            const saveButton = this;
            const originalText = saveButton.textContent;
            saveButton.textContent = 'Enregistré !';

            setTimeout(() => {
                saveButton.textContent = originalText;
                saveButton.disabled = false;
                saveButton.style.backgroundColor = '';
                reloadButtons();
            }, 2000);
        }
    }

    function autoSaveReview() {
        window.addEventListener('load', function() {
            // Sélectionner le bouton à l'aide du nouveau sélecteur
            var button = document.querySelector('div.a-section.in-context-ryp__submit-button-frame-desktop input.a-button-input');

            // Vérifier si le bouton existe avant d'ajouter l'écouteur d'événements
            if (button) {
                button.addEventListener('click', function() {
                    saveReview(true);
                });
            }
        });
    }

    //Ajout des différents boutons
    function addButtons(targetElement) {
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.flexDirection = 'column'; //Les éléments seront empilés en colonne
        buttonsContainer.style.alignItems = 'flex-start'; //Alignement des éléments à gauche
        buttonsContainer.className = 'custom-button-container';

        //Créer un conteneur pour la première ligne (menu déroulant)
        const firstLineContainer = document.createElement('div');
        firstLineContainer.className = 'first-line-container';
        firstLineContainer.style.marginBottom = '15px'; //Ajout d'espace entre la première et la deuxième ligne

        //Vérifie si review_template existe (ancienne version du modèle)
        if (localStorage.getItem('review_template')) {
            const savedTemplate = JSON.parse(localStorage.getItem('review_template'));
            const { title, review } = savedTemplate;
            //Utilise le titre de review_template comme nom du modèle ou "Ancien modèle" si vide
            const name = title.trim() === "" ? "Ancien modèle" : title;
            //Récupère les modèles existants
            let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
            //Ajoute le nouveau modèle
            savedTemplates.push({ name, title, review });
            //Sauvegarde les modèles dans localStorage
            localStorage.setItem('review_templates', JSON.stringify(savedTemplates));
            //Supprime review_template
            localStorage.removeItem('review_template');
        }

        //Ajout d'un champ de sélection pour les modèles
        const selectTemplate = document.createElement('select');
        selectTemplate.className = 'template-select';
        selectTemplate.innerHTML = `<option value="">Sélectionner un modèle</option>`;
        const savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
        savedTemplates.forEach((template, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = template.name;
            selectTemplate.appendChild(option);
        });

        firstLineContainer.appendChild(selectTemplate);
        buttonsContainer.appendChild(firstLineContainer); //Ajouter la première ligne au conteneur principal

        //Créer un conteneur pour la deuxième ligne (boutons liés aux modèles)
        const secondLineContainer = document.createElement('div');
        secondLineContainer.style.display = 'flex'; //Les boutons seront alignés horizontalement
        secondLineContainer.style.gap = '10px'; //Espace entre les boutons
        secondLineContainer.style.marginBottom = '15px'; //Ajout d'espace entre la deuxième et la troisième ligne
        secondLineContainer.className = 'second-line-container';

        //Bouton pour sauvegarder un modèle
        addButton('Sauvegarder un nouveau modèle', saveTemplate, secondLineContainer, 'template-button');

        //Bouton pour utiliser un modèle
        const useTemplateButton = addButton('Utiliser modèle', () => useTemplate(selectTemplate.value), secondLineContainer, 'template-button');
        useTemplateButton.style.display = 'none';

        //Bouton pour supprimer un modèle
        const deleteTemplateButton = addButton('Supprimer le modèle', () => deleteTemplate(selectTemplate.value), secondLineContainer, 'template-button');
        deleteTemplateButton.style.display = 'none';

        buttonsContainer.appendChild(secondLineContainer); //Ajouter la deuxième ligne au conteneur principal

        //Créer un conteneur pour la troisième ligne (boutons d'avis)
        const thirdLineContainer = document.createElement('div');
        thirdLineContainer.style.display = 'flex'; //Les boutons seront alignés horizontalement
        thirdLineContainer.style.gap = '10px'; //Espace entre les boutons
        thirdLineContainer.className = 'third-line-container';

        //Bouton pour sauvegarder l'avis
        addButton('Sauvegarder l\'avis', saveReview, thirdLineContainer);

        //Vérifie si un avis a été sauvegardé pour cet ASIN avant d'ajouter le bouton de restauration
        const asin = getASIN();
        if (localStorage.getItem(`review_${asin}`)) {
            addButton('Restaurer l\'avis', restoreReview, thirdLineContainer);
        }

        buttonsContainer.appendChild(thirdLineContainer); //Ajouter la troisième ligne au conteneur principal

        //Afficher/cacher les boutons "Utiliser modèle" et "Supprimer modèle" lorsque l'utilisateur sélectionne un modèle
        selectTemplate.addEventListener('change', function () {
            const selectedValue = selectTemplate.value;
            if (selectedValue === "") {
                useTemplateButton.style.display = 'none';
                deleteTemplateButton.style.display = 'none';
            } else {
                useTemplateButton.style.removeProperty('display');
                deleteTemplateButton.style.removeProperty('display');
            }
        });

        //submitButtonArea.prepend(buttonsContainer);
        //Ajouter les boutons à l'élément cible
        targetElement.appendChild(buttonsContainer);
        document.querySelectorAll('.custom-button').forEach(button => {
            button.addEventListener('click', function(event) {
                event.preventDefault(); // Empêche le comportement par défaut (comme un "submit")
                event.stopPropagation(); // Empêche la propagation de l'événement
            });
        });
    }

    //Crée la fenêtre popup de configuration avec la fonction de déplacement
    async function createConfigPopupRR() {
        if (document.getElementById('configPopupRR')) {
            return; //Termine la fonction pour éviter de créer une nouvelle popup
        }
        const popup = document.createElement('div');
        popup.id = "configPopupRR";
        popup.innerHTML = `
    <h2 id="configPopupHeader">
      <span style="color: #0463d5;">Paramètres</span>
      <span style="color: #1d820c;">ReviewRemember</span>
      <span style="color: #0463d5;">v${versionRR}</span>
      <span id="closePopupRR" style="float: right; cursor: pointer;">&times;</span></h2>
    <div style="text-align: center; margin-bottom: 20px;">
        <p id="links-container" style="text-align: center;">
            <a href="${baseUrlPickme}/wiki/doku.php?id=plugins:reviewremember" target="_blank">
                <img src="${baseUrlPickme}/img/wiki.png" alt="Wiki ReviewRemember" style="vertical-align: middle; margin-right: 5px; width: 25px; height: 25px;">
                Wiki ReviewRemember
            </a>
            ${isMobile() ? '<br>' : '<span id="separator"> | </span>'}
            <a href="${baseUrlPickme}/wiki/doku.php?id=vine:comment_nous_aider_gratuitement" target="_blank">
                <img src="${baseUrlPickme}/img/soutiens.png" alt="Soutenir gratuitement" style="vertical-align: middle; margin-right: 5px; width: 25px; height: 25px;">
                Soutenir gratuitement
            </a>
        </p>
    </div>
    <div class="checkbox-container">
      ${createCheckbox('RREnabled', 'Activer Review<wbr>Remember', 'Active le module ReviewRemeber qui permet de gérer les avis produits (sauvegardes, modèles, génération de mails, ...)')}
      ${createCheckbox('autoSaveEnabled', 'Sauvegarde automatique des avis', 'Les avis sont sauvegardés dès que vous cliquez sur "Envoyer" sans avoir besoin de l\'enregistrer avant')}
      ${createCheckbox('enableDateFunction', 'Surligner le statut des avis', 'Change la couleur du "Statut du commentaire" dans vos avis "En attente de vérification" en fonction de leur date d\'ancienneté. Entre 0 et 6 jours -> Bleu, 7 à 13 jours -> Vert, 14 à 29 jours -> Orange, plus de 30 jours -> Rouge')}
      ${createCheckbox('enableReviewStatusFunction', 'Surligner les avis vérifiés', 'Change la couleur du "Statut du commentaire" dans vos avis "Vérifiées" en fonction de leur statut actuel (Approuvé, Non approuvé, etc...)')}
      ${createCheckbox('filterEnabled', 'Cacher les avis approuvés', 'Dans l\'onglet "Vérifiées" de vos avis, si l\'avis  est Approuvé, alors il est caché')}
      ${createCheckbox('hidePendingEnabled', 'Pouvoir cacher les avis "En attente de vérification"')}
      ${createCheckbox('lastUpdateEnabled', 'Afficher la date de la dernière modification du % d\'avis', 'Indique la date de la dernière modification du % des avis sur le compte')}
      ${createCheckbox('evaluationBreakdownEnabled', 'Afficher la répartition des évaluations', 'Affiche le détail des évaluations Excellent, Bien, Juste et Pauvre à côté du score')}
      ${createCheckbox('targetPercentageEnabled', 'Afficher le nombre d\'avis nécessaires pour atteindre un % cible', 'Affiche le nombre d\'avis qu\'il va être nécessaire de faire pour atteindre le % défini')}
      ${createCheckbox('hideHighlightedReviewsEnabled', 'Cacher l\'encadré "Avis en évidence"', 'Masque le carrousel des avis mis en évidence sur la page Compte pour gagner de la place')}
      ${createCheckbox('pageEnabled', 'Affichage des pages en partie haute', 'En plus des pages de navigation en partie basse, ajoute également la navigation des pages en haut')}
      ${createCheckbox('emailEnabled', 'Génération automatique des emails', 'Permet de générer automatiquement des mails à destination du support vine pour faire retirer un produit de votre liste d\'avis. Attention, on ne peut générer un mail que si le produit a été vu au moins une fois dans la liste de l\'onglet "Commandes"')}
      ${createCheckbox('profilEnabled', 'Mise en avant des avis avec des votes utiles sur les profils Amazon','Surligne de la couleur définie les avis ayant un vote utile ou plus. Il est également mis en début de page. Le surlignage ne fonctionne pas si l\'avis possède des photos')}
      ${false ? createCheckbox('footerEnabled', 'Supprimer le footer sur les profils Amazon (à décocher si les avis ne se chargent pas)', 'Supprime le bas de page sur les pages de profil Amazon, cela permet de charger plus facilement les avis sans descendre tout en bas de la page. Cela ne fonctionne que sur PC, donc à désactiver si vous avez le moindre problème sur cette page') : ''}
       </div>
    ${addActionButtons()}
  `;
        document.body.appendChild(popup);

        document.getElementById('closePopupRR').addEventListener('click', () => {
            document.getElementById('configPopupRR').remove();
        });

        //Ajoute des écouteurs pour les nouveaux boutons
        document.getElementById('emailPopup').addEventListener('click', createEmailPopup);
        document.getElementById('reviewColor').addEventListener('click', setHighlightColor);
        document.getElementById('exportCSV').addEventListener('click', exportReviewsToCSV);

        document.getElementById('targetPercentageEnabled').addEventListener('click', function() {
            if (this.checked) {
                promptForTargetPercentage();
            }
        });

        document.getElementById('purgeTemplate').addEventListener('click', () => {
            if (confirm("Êtes-vous sûr de vouloir supprimer tous les modèles d'avis ?")) {
                deleteAllTemplates();
                reloadButtons();
            }
        });

        document.getElementById('purgeReview').addEventListener('click', () => {
            if (confirm("Êtes-vous sûr de vouloir supprimer tous les avis ?")) {
                deleteAllReviews();
                reloadButtons();
            }
        });
        //Import
        document.getElementById('importCSV').addEventListener('click', function() {
            document.getElementById('fileInput').click();
        });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'fileInput';
        fileInput.style.display = 'none'; //Le rend invisible
        fileInput.accept = '.csv'; //Accepte uniquement les fichiers .csv

        //Ajoute l'élément input au body du document
        document.body.appendChild(fileInput);
        document.getElementById('fileInput').addEventListener('change', function(event) {
            const file = event.target.files[0]; //Obtient le fichier sélectionné
            if (file) {
                readAndImportCSV(file); //Envoie le fichier à la fonction
            }
        });

        dragElement(popup);

        document.getElementById('saveConfigRR').addEventListener('click', saveConfigRR);
        document.getElementById('closeConfigRR').addEventListener('click', () => popup.remove());
    }

    function createCheckbox(name, label, explanation = null, disabled = false) {
        const isChecked = localStorage.getItem(name) === 'true' ? 'checked' : '';
        const isDisabled = disabled ? 'disabled' : '';

        const color = 'gray';
        const helpSpanId = `help-span-${name}`;

        const helpIcon = explanation
        ? `<span id="${helpSpanId}" style="cursor: help; color: ${color}; font-size: 16px;">?</span>`
        : '';

        const checkboxHtml = `<label class="${isDisabled ? 'disabled' : ''}" style="display: flex; align-items: flex-start; gap: 8px;">
    <div style="flex: 1;">
        <input type="checkbox" id="${name}" name="${name}" ${isChecked} ${isDisabled}>
        ${label}
    </div>
    ${helpIcon ? `<div style="width: 20px; text-align: center;">${helpIcon}</div>` : ''}
</label>`;


        //Attacher le gestionnaire d'événements après le rendu de l'HTML
        setTimeout(() => {
            const helpSpan = document.getElementById(helpSpanId);
            if (helpSpan) {
                helpSpan.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    alert(explanation); //Ou toute autre logique d'affichage d'explication
                });
            }
        }, 0);

        return checkboxHtml;
    }

    //Sauvegarde la configuration
    async function saveConfigRR() {
        document.querySelectorAll('#configPopupRR input[type="checkbox"]').forEach(input => {
            //Stocke la valeur (true ou false) dans localStorage en tant que chaîne de caractères
            localStorage.setItem(input.name, input.checked.toString());
        });
        //alert('Configuration sauvegardée.');
        document.getElementById('configPopupRR').remove();
    }

    //Ajoute les boutons pour les actions spécifiques qui ne sont pas juste des toggles on/off
    function addActionButtons() {
        return `
<div class="button-container action-buttons">
  <button id="emailPopup">Configurer les emails</button><br>
  <button id="reviewColor">Couleur de bordure des avis</button><br>
  <button id="exportCSV">Exporter les avis en CSV</button>
  <button id="importCSV">Importer les avis en CSV</button>
  <button id="purgeTemplate">Supprimer tous les modèles d'avis</button>
  <button id="purgeReview">Supprimer tous les avis</button>
</div>
<div class="button-container final-buttons">
  <button class="full-width" id="saveConfigRR">Enregistrer</button>
  <button class="full-width" id="closeConfigRR">Fermer</button>
</div>
    `;
    }

    //Ajouter la commande de menu "Paramètres"
    GM_registerMenuCommand("Paramètres ReviewRemember", createConfigPopupRR, "r");
    //End

    const url = window.location.href;

    let isAmazonTargetPage = false;

    try {
        const { pathname } = new URL(url);
        const normalizedPath = pathname.replace(/\/$/, '');

        isAmazonTargetPage = [
            '/review/create-review',
            '/review/edit-review',
            '/reviews/edit-review',
            '/vine/vine-reviews',
            '/vine/account',
            '/vine/orders',
            '/vine/resources'
        ].some(path => normalizedPath === path || normalizedPath.startsWith(path + '/'))
        || normalizedPath.startsWith('/gp/profile/');
    } catch (error) {
        console.warn('ReviewRememberPM: unable to parse URL for matching', error);
    }

    if (!isAmazonTargetPage) {
        window.createConfigPopupRR = createConfigPopupRR;
        return;
    }

    function initReviewRemember() {

        //On initialise les infos pour la version mobile (ou non)
        var pageX = "Page X";

        //Trie des avis sur profil
        //Marquer une carte comme traitée
        function marquerCarteCommeTraitee(carte) {
            carte.dataset.traitee = 'true';
        }

        //Classer les cartes traitées par ordre décroissant
        function classerCartesTraitees() {
            const cartesTraitees = Array.from(document.querySelectorAll('.review-card-container[data-traitee="true"], .item-hero-container.review-item-hero-container[data-traitee="true"]'));
            cartesTraitees.sort((a, b) => extraireValeur(a) - extraireValeur(b));
            const conteneur = document.querySelector('#reviewTabContentContainer');
            cartesTraitees.forEach(carte => conteneur.prepend(carte));
        }

        //Extraire la valeur numérique d'un "like"
        function extraireValeur(carte) {
            let valeurElement = carte.querySelector('.review-reaction-count'); //Ancien sélecteur
            if (!valeurElement) {
                valeurElement = carte.querySelector('.review-helpful-vote__count'); //Nouveau sélecteur
            }
            if (valeurElement) {
                const txt = valeurElement.innerText.trim().replace(/\u00A0/g, ' ');
                const match = txt.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            }
            return 0;
        }

        //Réorganisation principale
        function reorganiserCartes() {
            const cartes = Array.from(document.querySelectorAll('.review-card-container:not([data-traitee="true"]), .item-hero-container.review-item-hero-container:not([data-traitee="true"])'));
            const cartesAvecValeur = cartes.filter(carte => extraireValeur(carte) > 0);

            if (cartesAvecValeur.length > 0) {
                cartesAvecValeur.sort((a, b) => extraireValeur(b) - extraireValeur(a));
                const conteneur = document.querySelector('#reviewTabContentContainer');
                cartesAvecValeur.forEach(carte => {
                    marquerCarteCommeTraitee(carte);
                    carte.style.setProperty('border', `3px solid ${reviewColor}`, 'important');
                    conteneur.prepend(carte);
                });
                classerCartesTraitees();
            }
        }

        //Observer les changements sur la page profile
        function changeProfil() {
            if (window.location.href.startsWith('https://www.amazon.fr/gp/profile')) {
                const observer = new MutationObserver((mutations) => {
                    let mutationsAvecAjouts = mutations.some(mutation => mutation.addedNodes.length > 0);
                    if (mutationsAvecAjouts) {
                        reorganiserCartes();
                    }
                });
                observer.observe(document.querySelector('#reviewTabContentContainer'), { childList: true, subtree: true });
                reorganiserCartes();
            }
        }

        const asin = new URLSearchParams(window.location.search).get('asin');

        //Définition des styles pour les boutons
        const styles = `
        .custom-button {
            padding: 0 10px 0 11px;
            font-size: 13px;
            line-height: 29px;
            vertical-align: middle;
            cursor: pointer;
        }
        .custom-button-container {
            margin-right: 10px; /* Ajoute un espace après les boutons et avant le bouton 'Envoyer' */
        }
        .template-button {
            background-color: #FFA500; /* Couleur orange pour les boutons liés au modèle */
            border-color: #FFA500;
        }
        .template-button:hover {
            background-color: #cc8400;
        }
    `;

        //Crée une balise de style et ajoute les styles définis ci-dessus
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        //Fonctions pour les couleurs des avis
        //Fonction pour changer la couleur de la barre en fonction du pourcentage (obsolète)
        function changeColor() {
            if (document.URL === "https://www.amazon.fr/vine/account") {
                const progressBar = document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress-bar span')
                || document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress span');

                if (!progressBar) {
                    return;
                }

                const progressValueRaw = progressBar.getAttribute('data-progress') || progressBar.dataset.progress || progressBar.style.width;
                const progressValue = parseFloat((progressValueRaw || '').toString().replace('%', ''));

                if (!Number.isFinite(progressValue)) {
                    return;
                }

                const width = progressBar.style.width || (Number.isFinite(progressValue) ? `${progressValue}%` : '');
                let color = '';
                if (progressValue < 60) {
                    color = 'red';
                } else if (progressValue >= 60 && progressValue < 90) {
                    color = 'orange';
                } else {
                    color = '#32cd32';
                }

                progressBar.style.backgroundColor = color;
                progressBar.style.width = width;
            }
        }

        //Affiche la dernière mise a jour du profil
        function lastUpdate(showLastUpdate = true, showEvaluationBreakdown = true) {
            if (document.URL === "https://www.amazon.fr/vine/account") {
                const shouldShowLastUpdate = showLastUpdate && lastUpdateEnabled === 'true';
                const shouldShowEvaluationBreakdown = showEvaluationBreakdown && evaluationBreakdownEnabled === 'true';

                if (!shouldShowLastUpdate && !shouldShowEvaluationBreakdown) {
                    const previousDateTimeElement = document.querySelector('.last-modification');
                    if (previousDateTimeElement) {
                        previousDateTimeElement.remove();
                    }

                    const previousBreakdown = document.querySelector('.rr-evaluation-breakdown');
                    if (previousBreakdown) {
                        previousBreakdown.remove();
                    }

                    return;
                }

                //Récupérer le pourcentage et la date précédents depuis le stockage local
                const previousPercentage = parseFloat(localStorage.getItem('vineProgressPercentage')) || null;
                const previousDate = localStorage.getItem('vineProgressDate') || null;
                const evaluationStats = shouldShowEvaluationBreakdown ? computeEvaluationStats() : { stats: {}, totalEvaluated: 0, ratingOrder: [], pendingCount: 0 };

                //console.log("Pourcentage précédent :", previousPercentage);
                //console.log("Date précédente :", previousDate);

                const progressText = document.querySelector('#vvp-perc-reviewed-metric-display .a-size-extra-large')
                || document.querySelector('#vvp-perc-reviewed-metric-display p strong');
                const progressContainer = document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress-bar')
                || document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress');
                const metricsBox = document.querySelector('#vvp-vine-account-details-box .a-box-inner')
                || document.querySelector('#vvp-vine-activity-metrics-box .a-box-inner');

                if (metricsBox) {
                    //Augmenter dynamiquement la hauteur du bloc des métriques
                    metricsBox.style.paddingTop = '10px'; //Ajouter du padding en haut
                    metricsBox.style.paddingBottom = '10px'; //Ajouter du padding en bas
                }

                if (progressText && progressContainer) {
                    if (!shouldShowLastUpdate) {
                        updateDateTimeElement(progressContainer, '', '', '', evaluationStats, shouldShowEvaluationBreakdown, shouldShowLastUpdate);
                        return;
                    }

                    const currentPercentageText = progressText.textContent.trim();
                    const currentPercentage = parseFloat(currentPercentageText.replace('%', '').replace(',', '.'));

                    if (!Number.isFinite(currentPercentage)) {
                        return;
                    }

                    //console.log("Pourcentage actuel :", currentPercentage);

                    if (previousPercentage === null || previousPercentage !== currentPercentage) {
                        const dateTimeNow = new Date().toLocaleString();
                        const difference = previousPercentage !== null ? currentPercentage - previousPercentage : 0;
                        const differenceText = previousPercentage !== null ? (difference > 0 ? `+${difference.toFixed(1)} %` : `${difference.toFixed(1)} %`) : '';
                        const differenceColor = difference > 0 ? 'green' : 'red';

                        //console.log("Différence :", differenceText);

                        //Stocker le nouveau pourcentage et la date dans le stockage local
                        localStorage.setItem('vineProgressPercentage', currentPercentage);
                        localStorage.setItem('vineProgressDate', dateTimeNow);

                        //console.log("Nouveau pourcentage stocké :", currentPercentage);
                        //console.log("Nouvelle date stockée :", dateTimeNow);

                        //Mettre à jour le texte de progression avec la date et l'heure de la dernière modification
                        updateDateTimeElement(progressContainer, dateTimeNow, differenceText, differenceColor, evaluationStats, shouldShowEvaluationBreakdown, shouldShowLastUpdate);
                    } else if (previousDate) {
                        //Si aucune modification détectée, afficher la date et l'heure de la dernière modification
                        updateDateTimeElement(progressContainer, previousDate, '', '', evaluationStats, shouldShowEvaluationBreakdown, shouldShowLastUpdate);
                    }
                }

                function formatTimestampToDate(timestamp) {
                    if (!timestamp || Number.isNaN(timestamp)) {
                        return '';
                    }

                    return new Date(timestamp).toLocaleDateString('fr-FR');
                }

                function parseReviewDateToTimestamp(dateString) {
                    if (!dateString) {
                        return null;
                    }

                    const trimmed = dateString.trim();
                    const slashMatch = trimmed.match(/^(\d{1,2})[\/\\-](\d{1,2})[\/\\-](\d{2,4})$/);
                    if (slashMatch) {
                        const day = parseInt(slashMatch[1], 10);
                        const month = parseInt(slashMatch[2], 10) - 1;
                        const year = parseInt(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3], 10);
                        const parsedDate = new Date(year, month, day);
                        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
                    }

                    const monthMap = {
                        janvier: 0,
                        février: 1,
                        fevrier: 1,
                        mars: 2,
                        avril: 3,
                        mai: 4,
                        juin: 5,
                        juillet: 6,
                        août: 7,
                        aout: 7,
                        septembre: 8,
                        octobre: 9,
                        novembre: 10,
                        décembre: 11,
                        decembre: 11
                    };

                    const monthMatch = trimmed.match(/^(\d{1,2})\s+([a-zàâçéèêëîïôûùüÿñæœ]+)\s+(\d{4})$/i);
                    if (monthMatch) {
                        const day = parseInt(monthMatch[1], 10);
                        const monthName = monthMatch[2].toLowerCase();
                        const year = parseInt(monthMatch[3], 10);
                        const month = monthMap[monthName];
                        if (month !== undefined) {
                            const parsedDate = new Date(year, month, day);
                            return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
                        }
                    }

                    const parsed = Date.parse(trimmed);
                    return Number.isNaN(parsed) ? null : parsed;
                }

                function getEvaluationBreakdownMode() {
                    const storedMode = localStorage.getItem('evaluationBreakdownMode');
                    return storedMode === 'all' || storedMode === 'current' ? storedMode : 'current';
                }

                function getEvaluationPeriodBounds() {
                    const startElement = document.getElementById('vvp-eval-start-stamp');
                    const endElement = document.getElementById('vvp-eval-end-stamp');

                    const startStamp = startElement ? parseInt(startElement.textContent, 10) : NaN;
                    const endStamp = endElement ? parseInt(endElement.textContent, 10) : NaN;

                    return {
                        periodStart: Number.isNaN(startStamp) ? null : startStamp,
                        periodEnd: Number.isNaN(endStamp) ? null : endStamp
                    };
                }

                function computeEvaluationStats(mode = getEvaluationBreakdownMode()) {
                    const ratingOrder = ['Excellent', 'Bien', 'Juste', 'Pauvre'];
                    const pendingLabel = 'En attente';
                    const pendingLabelNormalized = pendingLabel.toLowerCase();
                    const stats = ratingOrder.reduce((acc, rating) => {
                        acc[rating] = 0;
                        return acc;
                    }, {});
                    let totalEvaluated = 0;
                    let pendingCount = 0;
                    const { periodStart, periodEnd } = getEvaluationPeriodBounds();
                    const isPeriodFilterActive = mode === 'current' && periodStart !== null && periodEnd !== null;

                    Object.keys(localStorage).forEach(function(key) {
                        if (!key.startsWith('review_') || key === 'review_templates') {
                            return;
                        }

                        const storedValue = localStorage.getItem(key);
                        if (!storedValue) {
                            return;
                        }

                        try {
                            const parsedValue = JSON.parse(storedValue);
                            const evaluationRaw = parsedValue && parsedValue.evaluation;

                            if (!evaluationRaw) {
                                return;
                            }

                            const reviewDateRaw = parsedValue && parsedValue.date;
                            const reviewTimestamp = parseReviewDateToTimestamp(reviewDateRaw);

                            if (isPeriodFilterActive) {
                                if (!reviewTimestamp || reviewTimestamp < periodStart || reviewTimestamp > periodEnd) {
                                    return;
                                }
                            }

                            const normalizedEvaluation = evaluationRaw.toString().trim().toLowerCase();
                            const matchedRating = ratingOrder.find(rating => rating.toLowerCase() === normalizedEvaluation);
                            const isPending = normalizedEvaluation === pendingLabelNormalized;

                            if (matchedRating) {
                                stats[matchedRating] += 1;
                                totalEvaluated += 1;
                                return;
                            }

                            if (isPending) {
                                pendingCount += 1;
                            }
                        } catch (error) {
                            console.error("[ReviewRemember] Erreur lors de la lecture de l'évaluation pour la clé :", key, error);
                        }
                    });

                    return {
                        stats,
                        totalEvaluated,
                        ratingOrder,
                        pendingCount,
                        mode: mode === 'all' ? 'all' : 'current',
                        isPeriodFilterActive,
                        periodStart,
                        periodEnd
                    };
                }

                function formatPercentage(value, decimals = 1) {
                    if (!Number.isFinite(value)) {
                        return '0';
                    }
                    const rounded = Number(value.toFixed(decimals));
                    if (Number.isInteger(rounded)) {
                        return rounded.toString();
                    }
                    return rounded.toFixed(decimals);
                }

    function computeAverageScore(evaluationStats) {
        const scoreWeights = {
            Excellent: 100,
            Bien: 74,
            Juste: 49,
                        Pauvre: 0
                    };

                    const weightedSum = Object.keys(scoreWeights).reduce((sum, rating) => {
                        const count = evaluationStats.stats && evaluationStats.stats[rating] ? evaluationStats.stats[rating] : 0;
                        return sum + (count * scoreWeights[rating]);
                    }, 0);

                    const totalCount = Object.keys(scoreWeights).reduce((sum, rating) => {
                        const count = evaluationStats.stats && evaluationStats.stats[rating] ? evaluationStats.stats[rating] : 0;
                        return sum + count;
                    }, 0);

                    if (totalCount === 0) {
                        return null;
                    }

        return weightedSum / totalCount;
    }

    function formatAverageScoreText(score) {
        if (score === null) {
            return 'N/A';
        }

        const roundedScore = Math.round(score * 10) / 10;
        if (Number.isInteger(roundedScore)) {
            return String(Math.trunc(roundedScore));
        }

        return roundedScore.toFixed(1);
    }

    let lastEvaluationContext = null;
    let lastEvaluationStats = null;
    let lastEvaluationToggleTime = 0;

    function buildShareText(evaluationStats, averageScore = computeAverageScore(evaluationStats)) {
        const modeLabelText =
              evaluationStats.mode === 'all' || !evaluationStats.isPeriodFilterActive
        ? 'Toutes les évaluations'
        : 'Période actuelle';

        const lines = [];
        const scoreText = averageScore !== null ? `${formatAverageScoreText(averageScore)}/100` : 'N/A';

        lines.push('📊 Bilan des évaluations');
        lines.push('');
        lines.push(`Score moyen (${modeLabelText}) : **${scoreText}**`);

        if (evaluationStats.isPeriodFilterActive && evaluationStats.periodStart !== null && evaluationStats.periodEnd !== null) {
            const startLabel = formatTimestampToDate(evaluationStats.periodStart);
            const endLabel = formatTimestampToDate(evaluationStats.periodEnd);
            lines.push(`🗓️ Période : du ${startLabel} au ${endLabel}`);
        }

        lines.push('');
        lines.push('📌 Répartition');

        const emojiByRating = {
            Excellent: '🟦',
            Bien: '🟩',
            Juste: '🟧',
            Pauvre: '🟥'
        };

        (evaluationStats.ratingOrder && evaluationStats.ratingOrder.length
         ? evaluationStats.ratingOrder
         : ['Excellent', 'Bien', 'Juste', 'Pauvre']
        ).forEach(rating => {
            const count = evaluationStats.stats && evaluationStats.stats[rating] ? evaluationStats.stats[rating] : 0;
            const percentageValue = evaluationStats.totalEvaluated > 0
            ? (count / evaluationStats.totalEvaluated) * 100
            : 0;
            const percentage = formatPercentage(percentageValue);
            const emoji = emojiByRating[rating] || '•';

            lines.push(`${emoji} ${rating} : **${percentage}%** (${count})`);
        });

        const pendingCount = evaluationStats.pendingCount || 0;
        lines.push('');
        lines.push(`⬜ En attente : **${pendingCount}**`);
        lines.push(`Total évaluées : **${evaluationStats.totalEvaluated}**`);

        return lines.join('\n');
    }

    async function copyShareText(text) {
        const handleSuccess = () => {
            alert('Statistiques copiées dans le presse-papiers.');
        };
        const handleFallback = () => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    handleSuccess();
                } else {
                    alert('Impossible de copier les statistiques.');
                }
            } catch (error) {
                console.error('[ReviewRemember] Échec de la copie des statistiques :', error);
                alert('Impossible de copier les statistiques.');
            }
            document.body.removeChild(textarea);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                handleSuccess();
                return;
            } catch (error) {
                console.error('[ReviewRemember] Échec de la copie avec l’API Clipboard :', error);
            }
        }
        handleFallback();
    }

    function refreshEvaluationBreakdown(modeOverride = null) {
        if (!lastEvaluationContext || !lastEvaluationContext.containerElement) {
            return;
        }
        const targetMode = modeOverride || getEvaluationBreakdownMode();
        const updatedStats = computeEvaluationStats(targetMode);
        updateDateTimeElement(
            lastEvaluationContext.containerElement,
            lastEvaluationContext.dateTime,
            lastEvaluationContext.differenceText,
            lastEvaluationContext.differenceColor,
            updatedStats,
            lastEvaluationContext.showBreakdown,
            lastEvaluationContext.showLastUpdate
        );
    }

    function handleEvaluationBreakdownAction(event) {
        const target = event.target;
        if (!target) {
            return;
        }

        const toggle = target.closest('.rr-evaluation-toggle');
        const share = toggle ? null : target.closest('.rr-evaluation-share');

        if (!toggle && !share) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!lastEvaluationContext) {
            return;
        }

        if (toggle) {
            const now = Date.now();
            if (now - lastEvaluationToggleTime < 300) {
                return;
            }
            lastEvaluationToggleTime = now;
            const currentMode = getEvaluationBreakdownMode();
            const nextMode = currentMode === 'all' ? 'current' : 'all';
            localStorage.setItem('evaluationBreakdownMode', nextMode);
            refreshEvaluationBreakdown(nextMode);
            return;
        }

        const stats = computeEvaluationStats(getEvaluationBreakdownMode());
        const shareText = buildShareText(stats, computeAverageScore(stats));
        copyShareText(shareText);
    }

    ['click', 'touchend'].forEach(eventName => {
        document.addEventListener(eventName, handleEvaluationBreakdownAction, { capture: true, passive: false });
    });

    function updateDateTimeElement(containerElement, dateTime, differenceText = '', differenceColor = '', evaluationStats = { stats: {}, totalEvaluated: 0, ratingOrder: [] }, showBreakdown = true, showLastUpdate = true) {
        if (!showBreakdown && !showLastUpdate) {
            return;
        }

        lastEvaluationContext = {
            containerElement,
            dateTime,
            differenceText,
            differenceColor,
            showBreakdown,
            showLastUpdate
        };
        lastEvaluationStats = evaluationStats;

                    //Supprimer l'élément de date précédent s'il existe
                    let previousDateTimeElement = document.querySelector('.last-modification');
                    if (previousDateTimeElement) {
                        previousDateTimeElement.remove();
                    }

                    //Supprimer les anciennes informations de répartition si elles existent
                    const previousBreakdown = document.querySelector('.rr-evaluation-breakdown');
                    if (previousBreakdown) {
                        previousBreakdown.remove();
                    }

                    //Créer un nouvel élément de date
                    const dateTimeElement = showLastUpdate ? document.createElement('span') : null;
                    if (dateTimeElement) {
                        dateTimeElement.className = 'last-modification';
                        dateTimeElement.style.display = 'block';
                        dateTimeElement.style.marginTop = '8px';
                        //dateTimeElement.style.marginLeft = '10px';
                        dateTimeElement.innerHTML = `Dernière modification constatée le <strong>${dateTime}</strong>`;

                        if (differenceText) {
                            const differenceElement = document.createElement('span');
                            differenceElement.style.color = differenceColor;
                            differenceElement.textContent = ` (${differenceText})`;
                            dateTimeElement.appendChild(differenceElement);
                        }
                    }

                    if (showBreakdown) {
                        //Créer un nouvel élément pour la répartition des évaluations
                        const breakdownElement = document.createElement('div');
                        breakdownElement.className = 'rr-evaluation-breakdown';
                        breakdownElement.style.display = 'block';
                        breakdownElement.style.marginTop = '8px';
                        const averageScore = computeAverageScore(evaluationStats);

                        const breakdownHeader = document.createElement('div');
                        breakdownHeader.className = 'rr-evaluation-breakdown-header';
                        breakdownHeader.style.display = 'flex';
                        breakdownHeader.style.justifyContent = 'flex-start';
                        breakdownHeader.style.alignItems = 'center';
                        breakdownHeader.style.columnGap = '8px';
                        breakdownHeader.style.rowGap = '6px';
                        breakdownHeader.style.flexWrap = 'wrap';
                        breakdownHeader.style.marginBottom = '4px';

                        const modeLabel = document.createElement('span');
                        modeLabel.className = 'rr-evaluation-breakdown-mode';
                        if (evaluationStats.mode === 'all' || !evaluationStats.isPeriodFilterActive) {
                            modeLabel.textContent = 'Toutes :';
                        } else {
                            const startLabel = formatTimestampToDate(evaluationStats.periodStart);
                            const endLabel = formatTimestampToDate(evaluationStats.periodEnd);
                            modeLabel.textContent = `Période actuelle :`;
                        }
                        breakdownHeader.appendChild(modeLabel);

                        const actionButtons = document.createElement('div');
                        actionButtons.style.display = 'flex';
                        actionButtons.style.flexWrap = 'wrap';
                        actionButtons.style.gap = '6px';
                        actionButtons.style.alignItems = 'center';

                        const toggleButton = document.createElement('button');
                        toggleButton.type = 'button';
                        toggleButton.className = 'a-button a-button-base a-button-mini rr-evaluation-toggle';
                        toggleButton.style.padding = '2px 8px';
                        toggleButton.style.lineHeight = '1.4';
                        toggleButton.style.whiteSpace = 'nowrap';
                        toggleButton.textContent = evaluationStats.mode === 'all' ? '↻ Période actuelle' : '↻ Toutes';
                        toggleButton.title = evaluationStats.mode === 'all'
                            ? 'Afficher uniquement les évaluations de la période actuelle'
                        : 'Afficher toutes les évaluations enregistrées';
                        actionButtons.appendChild(toggleButton);

                        const shareButton = document.createElement('button');
                        shareButton.type = 'button';
                        shareButton.className = 'a-button a-button-base a-button-mini rr-evaluation-share';
                        shareButton.style.padding = '2px 8px';
                        shareButton.style.lineHeight = '1.4';
                        shareButton.style.whiteSpace = 'nowrap';
                        shareButton.textContent = 'Partager';
                        shareButton.title = 'Copier le score moyen et la répartition pour Discord';
                        actionButtons.appendChild(shareButton);

                        breakdownHeader.appendChild(actionButtons);
                        breakdownElement.appendChild(breakdownHeader);

                        const ratingColorMap = {
                            'Excellent': '🟦',
                            'Bien': '🟩',
                            'Juste': '🟧',
                            'Pauvre': '🟥',
                            'En attente': '⬜️'
                        };

                        const breakdownItems = (evaluationStats.ratingOrder && evaluationStats.ratingOrder.length ? evaluationStats.ratingOrder : ['Excellent', 'Bien', 'Juste', 'Pauvre']).map(rating => {
                            const count = evaluationStats.stats && evaluationStats.stats[rating] ? evaluationStats.stats[rating] : 0;
                            const percentageValue = evaluationStats.totalEvaluated > 0 ? (count / evaluationStats.totalEvaluated) * 100 : 0;
                            const percentage = formatPercentage(percentageValue);
                            const colorSquare = ratingColorMap[rating] || '⬜';
                            return `${colorSquare} <strong>${rating}</strong> : ${percentage}% (${count})`;
                        });

                        const pendingCount = evaluationStats.pendingCount || 0;
                        if (pendingCount > 0 || evaluationStats.pendingCount === 0) {
                            breakdownItems.push(`${ratingColorMap['En attente']} <strong>En attente</strong> : ${pendingCount}`);
                        }

                        const breakdownContent = document.createElement('div');
                        breakdownContent.innerHTML = breakdownItems.join('<br>');
                        breakdownElement.appendChild(breakdownContent);

                        const scoreInfoText = "Ce score reste une simple estimation, mais la perspicacité moyenne peut probablement être lu ainsi :\n\n- 75 à 100 : Excellent\n- 50 à 74 : Bon\n- 25 à 49 : Passable\n- 0 à 24 : Mauvais\n\nElle ne comprend que les avis qui sont en mémoire (après un scan ou avoir parcouru les pages des avis vérifiés). Le score affichait par Amazon peut varier de ce score car nous ne connaissons pas le calcul exact, et il peut également prendre en compte des évaluations qui ne sont pas encore en mémoire ou également mettre un certain délai à s'actualiser.";
                        const scoreElement = document.createElement('div');
                        scoreElement.style.marginTop = '6px';
                        const scoreText = averageScore !== null ? `${formatAverageScoreText(averageScore)} / 100` : 'N/A';

                        const scoreLabel = document.createElement('strong');
                        scoreLabel.textContent = 'Score moyen :';
                        scoreElement.appendChild(scoreLabel);

                        const scoreValue = document.createElement('span');
                        scoreValue.textContent = ` ${scoreText} `;
                        scoreElement.appendChild(scoreValue);

                        const scoreInfoButton = document.createElement('button');
                        scoreInfoButton.type = 'button';
                        scoreInfoButton.textContent = '?';
                        scoreInfoButton.title = scoreInfoText;
                        scoreInfoButton.setAttribute('aria-label', 'Afficher les explications du score moyen');
                        scoreInfoButton.className = 'a-button a-button-base a-button-mini rr-evaluation-cta';
                        scoreInfoButton.style.padding = '0 8px';
                        scoreInfoButton.style.lineHeight = '1.4';
                        scoreInfoButton.style.cursor = 'pointer';
                        scoreInfoButton.addEventListener('click', function(event) {
                            event.preventDefault();
                            event.stopPropagation();
                            alert(scoreInfoText);
                        });
                        scoreElement.appendChild(scoreInfoButton);

                        breakdownElement.appendChild(scoreElement);

                        const lastScanLabel = readScanCompletion();
                        if (lastScanLabel) {
                            const lastScanElement = document.createElement('div');
                            lastScanElement.className = 'rr-last-scan';
                            lastScanElement.style.marginTop = '4px';
                            lastScanElement.innerHTML = `Dernier scan des évaluations le <strong>${lastScanLabel}</strong>`;
                            breakdownElement.appendChild(lastScanElement);
                        }

                        //Insérer les nouveaux éléments dans l'encadré "Évaluer le score de perspicacité" si disponible
                        const insightfulnessContainer = document.querySelector('#vvp-num-review-insightfulness-score-metric-display');
                        if (insightfulnessContainer) {
                            const insertionTarget = insightfulnessContainer.querySelector('.status-bar')
                            || insightfulnessContainer.lastElementChild
                            || insightfulnessContainer;
                            insertionTarget.insertAdjacentElement('afterend', breakdownElement);
                        } else {
                            //Fallback : conserver le placement historique si l'encadré n'est pas présent
                            containerElement.parentNode.insertBefore(breakdownElement, containerElement.nextSibling);
                            if (dateTimeElement) {
                                breakdownElement.insertAdjacentElement('afterend', dateTimeElement);
                            }
                            return;
                        }

                        if (!dateTimeElement) {
                            return;
                        }
                    }

                    //Placer la date de dernière modification près de la barre de progression principale
                    if (dateTimeElement) {
                        containerElement.parentNode.insertBefore(dateTimeElement, containerElement.nextSibling);
                    }
                }
            }
        }

        function targetPercentage() {
            if (document.URL === "https://www.amazon.fr/vine/account") {
                const { percentage, evaluatedArticles } = extractData();
                const storedValue = parseFloat(localStorage.getItem('gestavisTargetPercentage'));
                const missingArticles = calculateMissingReviews(percentage, evaluatedArticles, storedValue);
                const doFireWorks = localStorage.getItem('doFireWorks');

                if (storedValue <= percentage && doFireWorks === 'true') {
                    fireWorks();
                    localStorage.setItem('doFireWorks', 'false');
                } else if (storedValue > percentage) {
                    localStorage.setItem('doFireWorks', 'true');
                }

                insertResult(missingArticles, percentage, evaluatedArticles, storedValue);
                centerContentVertically();
                removeGreyText();
                trimInsightfulnessReminder();

                //Extraction des données de la page
                function extractData() {
                    const percentageTextElement = document.querySelector('#vvp-perc-reviewed-metric-display .a-size-extra-large')
                    || document.querySelector('#vvp-perc-reviewed-metric-display p strong');
                    const articlesTextElement = document.querySelector('#vvp-num-reviewed-metric-display .a-size-extra-large')
                    || document.querySelector('#vvp-num-reviewed-metric-display p strong');

                    const percentageText = percentageTextElement ? percentageTextElement.innerText : '0';
                    const articlesText = articlesTextElement ? articlesTextElement.innerText : '0';

                    const percentage = parseFloat(percentageText.replace(',', '.').replace('%', '').trim()) || 0;
                    const evaluatedArticles = parseInt(articlesText.replace(/[^0-9]/g, ''), 10);
                    return { percentage, evaluatedArticles: Number.isFinite(evaluatedArticles) ? evaluatedArticles : 0 };
                }

                //Calcul du nombre d'avis manquants
                function calculateMissingReviews(percentage, evaluatedArticles, targetPercentage) {
                    if (percentage === 0) return 0;
                    const totalArticles = evaluatedArticles / (percentage / targetPercentage);
                    const missingArticles = Math.ceil(totalArticles - evaluatedArticles);
                    return missingArticles;
                }

                //Injection des résultats
                function insertResult(missingArticles, currentPercentage, evaluatedArticles, targetPercentage) {
                    const targetDiv = document.querySelector('#vvp-num-reviewed-metric-display');
                    const progressBar = targetDiv ? (targetDiv.querySelector('.animated-progress-bar') || targetDiv.querySelector('.animated-progress.progress-green')) : null;
                    const resultSpan = document.createElement('span');
                    resultSpan.className = 'review-todo';
                    const missingArticlesNumber = parseInt(missingArticles, 10);

                    if (!isNaN(missingArticlesNumber) && missingArticlesNumber > 0) {
                        resultSpan.innerHTML = `Nombre d'avis à soumettre : <strong>${missingArticlesNumber}</strong> (avant d'atteindre ${targetPercentage} %).`;
                    } else {
                        const buffer = Math.floor((evaluatedArticles * (currentPercentage - targetPercentage)) / currentPercentage);

                        if (buffer > 0) {
                            resultSpan.innerHTML = `
                        Nombre d'avis à soumettre : <strong>Objectif atteint</strong> (${targetPercentage}% ou plus).<br>
                        Nombre de produits à commander avant de retomber sous les ${targetPercentage}% : <strong>${buffer}</strong>.
                    `;
                        } else {
                            resultSpan.innerHTML = `Nombre d'avis à soumettre : <strong>Objectif atteint</strong> (${targetPercentage}% ou plus).`;
                        }
                    }

                    resultSpan.style.display = 'block';
                    resultSpan.style.marginTop = '10px';

                    const hrElement = document.createElement('hr');

                    if (progressBar) {
                        progressBar.insertAdjacentElement('afterend', resultSpan);
                    } else if (targetDiv) {
                        targetDiv.appendChild(resultSpan);
                    }
                    resultSpan.insertAdjacentElement('afterend', hrElement);
                }

                function centerContentVertically() {
                    const metricsBox = document.querySelector('#vvp-vine-account-details-box .a-box-inner')
                    || document.querySelector('#vvp-vine-activity-metrics-box .a-box-inner');
                    if (metricsBox) {
                        metricsBox.style.display = 'flex';
                        metricsBox.style.flexDirection = 'column';
                        metricsBox.style.justifyContent = 'center';
                        metricsBox.style.height = '100%';
                    }
                }

                function removeGreyText() {
                    const greyTextElement = document.querySelector('p.grey-text');
                    if (greyTextElement) {
                        greyTextElement.remove();
                    }
                }

                function trimInsightfulnessReminder() {
                    const insightfulnessContainer = document.querySelector('#vvp-num-review-insightfulness-score-metric-display');
                    if (!insightfulnessContainer) {
                        return;
                    }

                    const guidelinesLink = insightfulnessContainer.querySelector('a[href="https://www.amazon.fr/vine/resources#review_guidelines"]');
                    if (!guidelinesLink) {
                        return;
                    }

                    const parentParagraph = guidelinesLink.closest('p');
                    if (!parentParagraph) {
                        return;
                    }

                    const newParagraph = document.createElement('p');
                    newParagraph.appendChild(guidelinesLink);
                    parentParagraph.replaceWith(newParagraph);
                }
            }
        }

        function hideHighlightedReviews() {
            if (!document.URL.startsWith("https://www.amazon.fr/vine/account")) {
                return;
            }

            let attempts = 0;
            const maxAttempts = 10;

            const attemptHide = () => {
                const highlightedCarousel = document.getElementById('vvp-rotw-carousel');
                if (highlightedCarousel) {
                    const previousElement = highlightedCarousel.previousElementSibling;
                    if (previousElement && previousElement.tagName === 'HR') {
                        previousElement.style.display = 'none';
                    }
                    highlightedCarousel.style.display = 'none';
                    return;
                }

                if (attempts < maxAttempts) {
                    attempts += 1;
                    setTimeout(attemptHide, 500);
                }
            };

            attemptHide();
        }

        //Fonction pour formater une date en format 'DD/MM/YYYY'
        function formatDate(date) {
            var day = date.getDate().toString().padStart(2, '0');
            var month = (1 + date.getMonth()).toString().padStart(2, '0');
            var year = date.getFullYear();

            return day + '/' + month + '/' + year;
        }

        //Fonction pour calculer la différence en jours entre deux dates
        function dateDiffInDays(date1, date2) {
            const diffInTime = date2.getTime() - date1.getTime();
            return Math.floor(diffInTime / (1000 * 3600 * 24));
        }

        function storeEvaluationStartStamp() {
            if (!document.URL.startsWith('https://www.amazon.fr/vine/account')) {
                return;
            }

            const startElement = document.getElementById('vvp-eval-start-stamp');
            if (!startElement) {
                return;
            }

            const stamp = parseInt(startElement.textContent, 10);
            const normalized = normalizeTimestamp(stamp);
            if (normalized === null) {
                return;
            }

            const stored = getStoredEvaluationPeriodStart();
            if (stored && stored.startTs === normalized) {
                return;
            }

            const formatted = formatDate(new Date(normalized));
            persistEvaluationPeriodStart(normalized, formatted);
        }

        //Style pour "Pas encore examiné"
        var styleReview = document.createElement('style');
        styleReview.textContent = `
        .pending-review-blue {
    font-weight: bold;
    color: #007FFF !important;
}
        .pending-review-green {
    font-weight: bold;
    color: #008000 !important;
}
        .pending-review-orange {
    font-weight: bold;
    color: #FFA500 !important;
}
        .pending-review-red {
    font-weight: bold;
    color: #FF0000 !important;
}
    `;
        document.head.appendChild(styleReview);
        //Fonction pour mettre en surbrillance les dates en fonction de leur âge
        function highlightDates() {
            if (window.location.href.includes('review-type=completed') || window.location.href.includes('orders')) {
                return; //Ne rien faire si l'URL contient "review-type=completed" ou "orders"
            }

            var tdElements = document.querySelectorAll('.vvp-reviews-table--text-col');
            var currentDate = new Date();

            tdElements.forEach(function(td, index, array) {
                var timestamp = parseInt(td.getAttribute('data-order-timestamp'));
                if (td.hasAttribute('data-order-timestamp')) {
                    var nextTd = array[index + 1];
                    //Vérifier si le timestamp est en millisecondes et le convertir en secondes si nécessaire
                    if (timestamp > 1000000000000) {
                        timestamp /= 1000; //Conversion en secondes
                    }

                    var date = new Date(timestamp * 1000); //Convertir le timestamp en millisecondes avant de créer l'objet Date

                    var daysDifference = dateDiffInDays(date, currentDate);

                    var formattedDate = formatDate(date);

                    //var style = '';
                    //var color = '';
                    if (daysDifference < 7) {
                        //color = '#0000FF'; //bleu
                        nextTd.classList.add('pending-review-blue');
                    } else if (daysDifference >= 7 && daysDifference < 14) {
                        //color = '#008000'; //vert
                        nextTd.classList.add('pending-review-green');
                    } else if (daysDifference >= 14 && daysDifference < 30) {
                        //color = '#FFA500'; //orange
                        nextTd.classList.add('pending-review-orange');
                    } else {
                        //color = '#FF0000'; //rouge
                        nextTd.classList.add('pending-review-red');
                    }

                    //Ajouter la couleur et le style gras au texte de la date
                    //style = 'font-weight: bold; color: ' + color + ';';
                    //td.innerHTML = '<font style="' + style + '">' + formattedDate + '</font>';
                }
            });
        }

        //Fonction pour mettre en surbrillance le statut de la revue
        function highlightReviewStatus() {
            var enableReviewStatusFunction = localStorage.getItem('enableReviewStatusFunction');

            if (enableReviewStatusFunction === 'true') {
                var tdElements = document.querySelectorAll('td.vvp-reviews-table--text-col');

                tdElements.forEach(function(td) {
                    var reviewStatus = td.innerText.trim();
                    var style = '';

                    switch (reviewStatus) {
                        case 'En attente d\'approbation':
                            style += 'font-weight: bold; color: #FFA500;'; //orange
                            break;
                        case 'Approuvé':
                            style += 'font-weight: bold; color: #008000;'; //vert
                            break;
                        case 'Non approuvé':
                            style += 'font-weight: bold; color: #FF0000;'; //rouge
                            break;
                        case 'Vous avez commenté cet article':
                            style += 'font-weight: bold; color: #0000FF;'; //bleu
                            break;
                        default:
                            style += 'color: inherit;'; //utiliser la couleur par défaut
                    }

                    //Appliquer le style au texte de la revue
                    td.style = style;
                });
            }
        }

        //Fonction pour mettre en surbrillance le statut "Cet article n'est plus disponible"
        function highlightUnavailableStatus() {
            var divElements = document.querySelectorAll('div.vvp-subtitle-color');

            divElements.forEach(function(div) {
                var subtitle = div.innerText.trim();

                if (subtitle === "Cet article n'est plus disponible") {
                    div.style.fontWeight = 'bold';
                    div.style.color = '#FF0000'; //rouge
                }
            });
        }

        //Fonction pour masquer les lignes de tableau contenant le mot-clé "Approuvé" et afficher les autres lignes
        function masquerLignesApprouve() {
            var lignes = document.querySelectorAll('.vvp-reviews-table--row');
            lignes.forEach(function(ligne) {
                var cellulesStatut = ligne.querySelectorAll('.vvp-reviews-table--text-col');
                var contientApprouve = false;
                cellulesStatut.forEach(function(celluleStatut) {
                    var texteStatut = celluleStatut.innerText.trim().toLowerCase();
                    if (texteStatut.includes('approuvé') && texteStatut !== 'non approuvé') {
                        contientApprouve = true;
                    }
                });
                if (contientApprouve) {
                    ligne.style.display = 'none';
                } else {
                    ligne.style.display = ''; //Afficher la ligne si elle ne contient pas "Approuvé"
                }
            });
        }

        //Ajoute une case à cocher pour masquer les avis en attente
        function addHidePendingCheckboxes() {
            const lignes = document.querySelectorAll('.vvp-reviews-table--row');
            lignes.forEach(function(ligne) {
                const imageCol = ligne.querySelector('.vvp-reviews-table--image-col');
                if (!imageCol || imageCol.querySelector('.rr-hide-review-checkbox')) {
                    return;
                }

                imageCol.style.position = 'relative';

                const link = ligne.querySelector('#vvp-reviews-product-detail-page-link, a[href*="/dp/"]');
                const asinMatch = link ? link.href.match(/\/dp\/([A-Z0-9]{10})/) : null;
                if (!asinMatch) {
                    return;
                }
                const asin = asinMatch[1];
                const storageKey = 'rr-hidden-' + asin;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.classList.add('rr-hide-review-checkbox');
                checkbox.style.position = 'absolute';
                checkbox.style.top = '5px';
                checkbox.style.left = '5px';
                checkbox.style.zIndex = '20';
                checkbox.checked = localStorage.getItem(storageKey) === 'true';

                if (checkbox.checked) {
                    ligne.style.opacity = '0.5';
                }

                checkbox.addEventListener('change', function() {
                    if (this.checked) {
                        ligne.style.opacity = '0.5';
                        localStorage.setItem(storageKey, 'true');
                    } else {
                        ligne.style.opacity = '';
                        localStorage.removeItem(storageKey);
                    }
                });

                imageCol.appendChild(checkbox);
            });
        }

        function getAsinFromRow(row) {
            const link = row.querySelector('#vvp-reviews-product-detail-page-link, a[href*="/dp/"]');
            if (link) {
                const asinFromLink = extractASIN(link.href);
                if (asinFromLink) {
                    return asinFromLink;
                }
            }

            const textColumns = row.querySelectorAll('.vvp-reviews-table--text-col');
            for (const cell of textColumns) {
                const asinFromText = extractASIN(cell.textContent.trim());
                if (asinFromText) {
                    return asinFromText;
                }
            }

            return null;
        }

        function getProductNameFromRow(row) {
            const link = row.querySelector('#vvp-reviews-product-detail-page-link, a[href*="/dp/"]');
            if (!link) {
                return '';
            }

            const fullText = link.querySelector('.a-truncate-full');
            if (fullText) {
                return fullText.textContent.trim();
            }

            return link.textContent.trim();
        }

        function syncQualityEvaluations() {
            const rows = document.querySelectorAll('.vvp-reviews-table--row');

            rows.forEach(row => {
                const asin = getAsinFromRow(row);
                if (!asin) {
                    return;
                }

                const textColumns = row.querySelectorAll('.vvp-reviews-table--text-col');
                const dateCell = textColumns[1];
                const evaluationCell = textColumns[3];
                const dateValue = dateCell ? dateCell.textContent.trim() : '';
                const productName = getProductNameFromRow(row);
                const evaluationValue = evaluationCell ? evaluationCell.textContent.trim() : '';

                const storageKey = `review_${asin}`;
                const storedReview = localStorage.getItem(storageKey);
                try {
                    const parsedReview = storedReview ? JSON.parse(storedReview) : null;
                    if (!parsedReview) {
                        const newEntry = {
                            title: '',
                            review: '',
                            date: dateValue || '',
                            evaluation: evaluationValue,
                            name: productName
                        };
                        localStorage.setItem(storageKey, JSON.stringify(newEntry));
                        return;
                    }

                    let shouldUpdate = false;

                    if (evaluationValue && parsedReview.evaluation !== evaluationValue) {
                        parsedReview.evaluation = evaluationValue;
                        shouldUpdate = true;
                    }

                    if (productName && parsedReview.name !== productName) {
                        parsedReview.name = productName;
                        shouldUpdate = true;
                    }

                    if (!parsedReview.date && dateValue) {
                        parsedReview.date = dateValue;
                        shouldUpdate = true;
                    }

                    if (shouldUpdate) {
                        localStorage.setItem(storageKey, JSON.stringify(parsedReview));
                    }
                } catch (error) {
                    console.error("[ReviewRemember] Erreur lors de la mise à jour des informations pour l'ASIN :", asin, error);
                }
            });
        }

        function initQualityEvaluationSync() {
            if (!window.location.href.includes('review-type=completed')) {
                return;
            }

            const ensureSync = () => {
                const table = document.querySelector('.vvp-reviews-table');
                if (!table) {
                    setTimeout(ensureSync, 500);
                    return;
                }

                syncQualityEvaluations();

                const observer = new MutationObserver(() => {
                    syncQualityEvaluations();
                });
                observer.observe(table, { childList: true, subtree: true });
            };

            ensureSync();
        }

        const scanStorageKey = 'rr-vine-scan-state';
        const evaluationStartStorageKey = 'rr-vine-eval-start';
        const scanCompletionStorageKey = 'rr-vine-scan-completed-at';
        const scanStopAllTs = new Date(2025, 5, 9).setHours(0, 0, 0, 0);
        let isScanStepRunning = false;
        let scanNavigationTimeout = null;
        let scanActionsUi = null;
        let scanCountdownInterval = null;
        let scanNavigationEta = null;

        //Retourne {startDate:"DD/MM/YYYY", startTs:number, sourceText:string, node:Element} ou null
        function getVineEvaluationPeriodStartFromAccountPage(root = document) {
            function parseFromNode(node) {
                const txt = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
                const patterns = [
                    /(\d{1,2}\s+[a-zA-Zéèêëàâäîïôöûüç\.]+\s+\d{4})\s*-/,
                    /(\d{2}\/\d{2}\/\d{4})\s*-/,
                    /(\d{1,2}\s+[a-zA-Zéèêëàâäîïôöûüç\.]+)\s+\d{4}/,
                    /(\d{2}\/\d{2}\/\d{4})/
                ];

                for (const pattern of patterns) {
                    const match = txt.match(pattern);
                    if (match && match[1]) {
                        const parsed = parseDDMMYYYYFlexible(match[1]);
                        if (parsed) {
                            return {
                                startDate: parsed.str,
                                startTs: parsed.ts,
                                sourceText: txt,
                                node
                            };
                        }
                    }
                }

                return null;
            }

            let el = root.getElementById('vvp-evaluation-period-tooltip-trigger');
            if (!el) {
                el = Array.from(root.querySelectorAll('span, div, p'))
                    .find(e => /période|évaluation/i.test(e.textContent));
            }
            if (!el) return null;

            return parseFromNode(el);
        }

        function persistEvaluationPeriodStart(startTs, startDate) {
            const normalizedTs = normalizeTimestamp(startTs);
            if (normalizedTs === null) {
                return null;
            }
            const label = startDate || formatDate(new Date(normalizedTs));
            const payload = { startTs: normalizedTs, startDate: label };
            localStorage.setItem(evaluationStartStorageKey, JSON.stringify(payload));
            return payload;
        }

        function getStoredEvaluationPeriodStart() {
            const raw = localStorage.getItem(evaluationStartStorageKey);
            if (!raw) {
                return null;
            }
            try {
                if (raw.includes('/')) {
                    const parsed = parseDDMMYYYYFlexible(raw);
                    if (parsed) {
                        return { startTs: parsed.ts, startDate: parsed.str };
                    }
                    return null;
                }
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.startTs) {
                    return null;
                }
                const normalized = normalizeTimestamp(parsed.startTs);
                if (normalized === null) {
                    return null;
                }
                return {
                    startTs: normalized,
                    startDate: parsed.startDate || formatDate(new Date(normalized))
                };
            } catch (error) {
                console.error('[ReviewRemember] Impossible de lire la période d\'évaluation stockée', error);
                return null;
            }
        }

        async function fetchEvaluationPeriodStart() {
            const stored = getStoredEvaluationPeriodStart();
            if (stored) {
                return stored;
            }

            const direct = getVineEvaluationPeriodStartFromAccountPage(document);
            if (direct) {
                return persistEvaluationPeriodStart(direct.startTs, direct.startDate) || direct;
            }

            try {
                const response = await fetch('https://www.amazon.fr/vine/account', { credentials: 'include' });
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const fetched = getVineEvaluationPeriodStartFromAccountPage(doc);
                if (fetched) {
                    return persistEvaluationPeriodStart(fetched.startTs, fetched.startDate) || fetched;
                }
                return null;
            } catch (error) {
                console.error('[ReviewRemember] Impossible de récupérer la période d\'évaluation', error);
                return null;
            }
        }

        function readScanState() {
            try {
                return JSON.parse(localStorage.getItem(scanStorageKey));
            } catch (error) {
                console.error('[ReviewRemember] Impossible de lire l\'état du scan', error);
                return null;
            }
        }

        function saveScanState(state) {
            localStorage.setItem(scanStorageKey, JSON.stringify(state));
        }

        function readScanCompletion() {
            return localStorage.getItem(scanCompletionStorageKey);
        }

        function saveScanCompletion() {
            const label = new Date().toLocaleString('fr-FR');
            localStorage.setItem(scanCompletionStorageKey, label);
            return label;
        }

        function clearScanState() {
            localStorage.removeItem(scanStorageKey);
        }

        function normalizeTimestamp(tsRaw) {
            if (!Number.isFinite(tsRaw)) return null;
            const ts = tsRaw > 1000000000000 ? tsRaw : tsRaw * 1000;
            const date = new Date(ts);
            if (!Number.isFinite(date.getTime())) return null;
            return date.setHours(0, 0, 0, 0);
        }

        function extractOrderDateTs(row) {
            const textColumns = row.querySelectorAll('.vvp-reviews-table--text-col');
            const dateCell = textColumns[1];
            if (!dateCell) return null;

            const tsAttr = Number(dateCell.dataset.orderTimestamp);
            if (Number.isFinite(tsAttr)) {
                const normalized = normalizeTimestamp(tsAttr);
                if (normalized !== null) return normalized;
            }

            const parsed = parseDDMMYYYYFlexible(dateCell.textContent);
            return parsed ? parsed.ts : null;
        }

        function detectOlderReview(limitTs) {
            const rows = document.querySelectorAll('.vvp-reviews-table--row');
            let foundOlder = false;
            let oldest = null;

            rows.forEach(row => {
                const ts = extractOrderDateTs(row);
                if (ts === null) return;

                if (oldest === null || ts < oldest) {
                    oldest = ts;
                }

                if (ts < limitTs) {
                    foundOlder = true;
                }
            });

            return { foundOlder, oldest };
        }

        function findNextReviewPageUrl() {
            const pagination = findPaginationBlock();
            if (!pagination) return null;

            const selected = pagination.querySelector('li.a-selected');
            if (selected) {
                let cursor = selected.nextElementSibling;
                while (cursor) {
                    const link = cursor.querySelector('a');
                    if (link && link.href) {
                        return link.href;
                    }
                    cursor = cursor.nextElementSibling;
                }
            }

            const fallback = pagination.querySelector('li.a-last a');
            return fallback ? fallback.href : null;
        }

        function goToReviewPage(pageNumber) {
            const urlObj = new URL(window.location.href);
            const currentPageParam = urlObj.searchParams.get('page');
            const currentPage = Number(currentPageParam || '1');
            const targetPage = Number(pageNumber);
            if (urlObj.searchParams.get('review-type') === 'completed' && currentPage === targetPage) {
                handleReviewScanIfNeeded();
                return;
            }
            urlObj.searchParams.set('page', pageNumber);
            if (!urlObj.searchParams.get('review-type')) {
                urlObj.searchParams.set('review-type', 'completed');
            }
            window.location.href = urlObj.toString();
        }

        function getRandomScanDelayMs() {
            return 3000 + Math.floor(Math.random() * 2001);
        }

        function updateScanDelayDisplay() {
            if (!scanActionsUi || !scanActionsUi.delayInfo || !scanNavigationEta) {
                if (scanActionsUi && scanActionsUi.delayInfo) {
                    scanActionsUi.delayInfo.textContent = '';
                    scanActionsUi.delayInfo.style.display = 'none';
                }
                return;
            }
            const remainingMs = Math.max(0, scanNavigationEta - Date.now());
            const seconds = Math.ceil(remainingMs / 1000);
            scanActionsUi.delayInfo.textContent = `Prochaine page dans ${seconds}s`;
            scanActionsUi.delayInfo.style.display = 'flex';
        }

        function startScanDelayCountdown(delayMs) {
            stopScanDelayCountdown();
            if (!delayMs) {
                return;
            }
            scanNavigationEta = Date.now() + delayMs;
            updateScanDelayDisplay();
            scanCountdownInterval = setInterval(() => {
                updateScanDelayDisplay();
            }, 1000);
        }

        function stopScanDelayCountdown() {
            if (scanCountdownInterval !== null) {
                clearInterval(scanCountdownInterval);
                scanCountdownInterval = null;
            }
            scanNavigationEta = null;
            if (scanActionsUi && scanActionsUi.delayInfo) {
                scanActionsUi.delayInfo.textContent = '';
                scanActionsUi.delayInfo.style.display = 'none';
            }
        }

        function stopReviewScan() {
            clearScanState();
            if (scanNavigationTimeout !== null) {
                clearTimeout(scanNavigationTimeout);
                scanNavigationTimeout = null;
            }
            isScanStepRunning = false;
            stopScanDelayCountdown();
            refreshScanActionsUi();
        }

        function waitForReviewsTable(callback, attempt = 0) {
            const rows = document.querySelectorAll('.vvp-reviews-table--row');
            if (rows.length > 0 || attempt >= 20) {
                callback();
                return;
            }
            setTimeout(() => waitForReviewsTable(callback, attempt + 1), 250);
        }

        function handleReviewScanIfNeeded() {
            const state = readScanState();
            if (!state) return;

            if (!window.location.href.includes('review-type=completed')) {
                clearScanState();
                stopScanDelayCountdown();
                refreshScanActionsUi();
                return;
            }

            if (isScanStepRunning) {
                return;
            }
            isScanStepRunning = true;

            waitForReviewsTable(() => {
                const limitTs = Number(state.limitTs);
                if (!Number.isFinite(limitTs)) {
                    clearScanState();
                    stopScanDelayCountdown();
                    refreshScanActionsUi();
                    isScanStepRunning = false;
                    return;
                }

                const result = detectOlderReview(limitTs);
                if (result.foundOlder) {
                    saveScanCompletion();
                    clearScanState();
                    stopScanDelayCountdown();
                    alert(`Scan terminé : avis plus ancien que ${state.limitLabel || 'la limite'} trouvé.`);
                    refreshScanActionsUi();
                    isScanStepRunning = false;
                    return;
                }

                const nextUrl = findNextReviewPageUrl();
                if (!nextUrl) {
                    saveScanCompletion();
                    clearScanState();
                    stopScanDelayCountdown();
                    alert('Scan terminé: aucune page suivante trouvée.');
                    refreshScanActionsUi();
                    isScanStepRunning = false;
                    return;
                }

                const delayMs = getRandomScanDelayMs();
                startScanDelayCountdown(delayMs);
                scanNavigationTimeout = setTimeout(() => {
                    scanNavigationTimeout = null;
                    if (!readScanState()) {
                        isScanStepRunning = false;
                        stopScanDelayCountdown();
                        refreshScanActionsUi();
                        return;
                    }
                    window.location.href = nextUrl;
                }, delayMs);
            });
        }

        async function startPeriodScan() {
            const evaluation = await fetchEvaluationPeriodStart();
            if (!evaluation) {
                alert('Impossible de trouver la date de début de la période d\'évaluation.');
                return;
            }

            saveScanState({
                mode: 'period',
                limitTs: evaluation.startTs,
                limitLabel: evaluation.startDate
            });
            stopScanDelayCountdown();
            refreshScanActionsUi();
            goToReviewPage(1);
        }

        function startFullScan() {
            saveScanState({
                mode: 'all',
                limitTs: scanStopAllTs,
                limitLabel: '09/06/2025'
            });
            stopScanDelayCountdown();
            refreshScanActionsUi();
            goToReviewPage(1);
        }

        function toggleReviewScan(mode) {
            const state = readScanState();
            if (state) {
                stopReviewScan();
                return;
            }
            if (mode === 'period') {
                startPeriodScan();
            } else {
                startFullScan();
            }
        }

        function refreshScanActionsUi() {
            if (!scanActionsUi) return;
            const state = readScanState();
            const hasEvaluationStart = !!getStoredEvaluationPeriodStart();
            const shouldDisable = !hasEvaluationStart && !state;
            const { btnAll, btnPeriod, btnAllText, btnPeriodText, warning } = scanActionsUi;
            btnAll.style.display = 'inline-flex';
            btnPeriod.style.display = 'inline-flex';
            btnAllText.textContent = 'Tout scanner';
            btnPeriodText.textContent = 'Scanner la période';
            [btnAll, btnPeriod].forEach(btn => {
                btn.style.opacity = shouldDisable ? '0.5' : '1';
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
            });
            if (warning) {
                warning.style.display = shouldDisable ? 'block' : 'none';
            }
            if (state) {
                const activeBtn = state.mode === 'period' ? btnPeriod : btnAll;
                const inactiveBtn = state.mode === 'period' ? btnAll : btnPeriod;
                const activeText = state.mode === 'period' ? btnPeriodText : btnAllText;
                inactiveBtn.style.display = 'none';
                activeText.textContent = 'Arrêter le scan';
                updateScanDelayDisplay();
            } else {
                stopScanDelayCountdown();
            }
        }

        function addReviewScanButtons() {
            if (!window.location.href.includes('review-type=completed')) {
                return;
            }

            const header = document.querySelector('.vvp-reviews-table--heading-top');
            if (!header) {
                setTimeout(addReviewScanButtons, 500);
                return;
            }

            if (header.querySelector('.rr-scan-actions')) {
                return;
            }

            const container = document.createElement('div');
            container.className = 'rr-scan-actions';
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '8px';
            container.style.marginTop = '10px';

            const btnAll = document.createElement('span');
            btnAll.className = 'a-button a-button-primary vvp-reviews-table--action-btn';
            const btnAllInner = document.createElement('span');
            btnAllInner.className = 'a-button-inner';
            const btnAllText = document.createElement('a');
            btnAllText.className = 'a-button-text';
            btnAllText.href = 'javascript:void(0)';
            btnAllText.textContent = 'Tout scanner';
            btnAllText.addEventListener('click', () => toggleReviewScan('all'));
            btnAllInner.appendChild(btnAllText);
            btnAll.appendChild(btnAllInner);

            const btnPeriod = document.createElement('span');
            btnPeriod.className = 'a-button a-button-primary vvp-reviews-table--action-btn';
            const btnPeriodInner = document.createElement('span');
            btnPeriodInner.className = 'a-button-inner';
            const btnPeriodText = document.createElement('a');
            btnPeriodText.className = 'a-button-text';
            btnPeriodText.href = 'javascript:void(0)';
            btnPeriodText.textContent = 'Scanner la période';
            btnPeriodText.addEventListener('click', () => toggleReviewScan('period'));
            btnPeriodInner.appendChild(btnPeriodText);
            btnPeriod.appendChild(btnPeriodInner);

            const btnHelp = document.createElement('span');
            btnHelp.className = 'a-button vvp-reviews-table--action-btn';
            const btnHelpInner = document.createElement('span');
            btnHelpInner.className = 'a-button-inner';
            const btnHelpText = document.createElement('a');
            btnHelpText.className = 'a-button-text';
            btnHelpText.href = 'javascript:void(0)';
            btnHelpText.textContent = '?';
            btnHelpText.addEventListener('click', () => alert("Le scan des avis vérifiés permet de mettre à jour dans la mémoire locale la date, le nom du produit et son évaluation. Le scan va parcourir les pages automatiquement avec un délai aléatoire, il faut juste le laisser faire.\n- Tout scanner : scannera jusqu'au 10/06/2025, date à laquelle les évaluations commencent\n- Scanner la période : scannera jusqu'à la date du début de votre période d'évaluation actuelle"));
            btnHelpInner.appendChild(btnHelpText);
            btnHelp.appendChild(btnHelpInner);

            const delayInfo = document.createElement('span');
            delayInfo.className = 'rr-scan-delay-info';
            delayInfo.style.display = 'none';
            delayInfo.style.alignItems = 'center';
            delayInfo.style.fontSize = '12px';
            delayInfo.style.paddingLeft = '4px';

            const warning = document.createElement('div');
            warning.style.display = 'none';
            warning.style.fontSize = '12px';
            warning.style.color = '#c45500';
            warning.style.lineHeight = '16px';
            warning.innerHTML = 'Le scan nécessite au moins une visite de la page Compte. Rendez-vous sur <a href="https://www.amazon.fr/vine/account" target="_blank">https://www.amazon.fr/vine/account</a> puis revenez ici.';

            container.appendChild(btnAll);
            container.appendChild(btnPeriod);
            container.appendChild(btnHelp);
            container.appendChild(delayInfo);
            container.appendChild(warning);

            scanActionsUi = { btnAll, btnPeriod, btnAllText, btnPeriodText, delayInfo, warning };
            refreshScanActionsUi();

            header.appendChild(container);
        }

        //Ajoute les pages en partie haute
        //Pour chercher '.a-text-center' ou 'nav.a-text-center'
        function findPaginationBlock() {
            // Cherche tous les éléments .a-text-center qui contiennent un ul.a-pagination
            return Array.from(document.querySelectorAll('.a-text-center'))
                .find(el => el.querySelector('ul.a-pagination') && (
                el.tagName === 'NAV' || el.getAttribute('role') === 'navigation'
            ));
        }

        function addPage() {
            //Sélection du contenu HTML du div source
            const sourceElement = findPaginationBlock();
            //Vérifier si l'élément source existe
            if (sourceElement) {
                //Maintenant que l'élément source a été mis à jour, copier son contenu HTML
                const sourceContent = sourceElement.outerHTML;
                const currentUrl = window.location.href;
                //Création d'un nouveau div pour le contenu copié
                const newDiv = document.createElement('div');
                newDiv.innerHTML = sourceContent;
                newDiv.style.textAlign = 'center'; //Centrer le contenu

                //Sélection du div cible où le contenu sera affiché
                //const targetDiv = document.querySelector('.vvp-tab-content .vvp-tab-content');
                var targetDiv = false;
                if (currentUrl.includes("vine-reviews")) {
                    targetDiv = document.querySelector('.vvp-reviews-table--heading-top');
                    if (targetDiv && targetDiv.parentNode) {
                        targetDiv.parentNode.insertBefore(newDiv, targetDiv);
                    }
                } else if (currentUrl.includes("orders")) {
                    targetDiv = document.querySelector('.vvp-tab-content .vvp-orders-table--heading-top') ||
                        document.querySelector('.vvp-orders-table');
                    if (targetDiv && targetDiv.parentNode) {
                        targetDiv.parentNode.insertBefore(newDiv, targetDiv);
                    }
                }

                //Trouver ou créer le conteneur de pagination si nécessaire
                let paginationContainer = sourceElement.querySelector('.a-pagination');
                if (!paginationContainer) {
                    paginationContainer = document.createElement('ul');
                    paginationContainer.className = 'a-pagination';
                    sourceElement.appendChild(paginationContainer);
                }
                //Ajout du bouton "Aller à" en haut et en bas
                if (currentUrl.includes("orders") || currentUrl.includes("vine-reviews")) {
                    //Création du bouton "Aller à la page X"
                    const gotoButtonUp = document.createElement('li');
                    gotoButtonUp.className = 'a-last'; //Utiliser la même classe que le bouton "Suivant" pour le style
                    gotoButtonUp.innerHTML = `<a id="goToPageButton">${pageX}<span class="a-letter-space"></span><span class="a-letter-space"></span></a>`;

                    //Ajouter un événement click au bouton "Aller à"
                    gotoButtonUp.querySelector('a').addEventListener('click', function() {
                        askPage();
                    });

                    //Création du bouton "Aller à la page X"
                    const gotoButton = document.createElement('li');
                    gotoButton.className = 'a-last'; //Utiliser la même classe que le bouton "Suivant" pour le style
                    gotoButton.innerHTML = `<a id="goToPageButton">${pageX}<span class="a-letter-space"></span><span class="a-letter-space"></span></a>`;

                    //Ajouter un événement click au bouton "Aller à"
                    gotoButton.querySelector('a').addEventListener('click', function() {
                        askPage();
                    });
                    //Insertion X en haut de page
                    const paginationTop = newDiv?.querySelector('.a-pagination');
                    const lastTop = paginationTop?.querySelector('.a-last');

                    if (paginationTop && lastTop && gotoButtonUp) {
                        paginationTop.insertBefore(gotoButtonUp, lastTop);
                    }

                    //Insertion en bas de page
                    const lastBottom = paginationContainer?.querySelector('.a-last');

                    if (paginationContainer && lastBottom && gotoButton) {
                        paginationContainer.insertBefore(gotoButton, lastBottom);
                    }
                }
            }
        }

        function askPage() {
            const userInput = prompt("Saisir la page où se rendre");
            const pageNumber = parseInt(userInput, 10); //Convertit en nombre en base 10
            if (!isNaN(pageNumber)) { //Vérifie si le résultat est un nombre
                //Obtient l'URL actuelle
                const currentUrl = window.location.href;
                //Crée un objet URL pour faciliter l'analyse des paramètres de l'URL
                const urlObj = new URL(currentUrl);
                var newUrl = "";
                if (window.location.href.includes("vine-reviews")) {
                    const reviewType = urlObj.searchParams.get('review-type') || '';
                    //Construit la nouvelle URL avec le numéro de page
                    newUrl = `https://www.amazon.fr/vine/vine-reviews?page=${pageNumber}&review-type=${reviewType}`;
                    //Redirige vers la nouvelle URL
                } else if (window.location.href.includes("orders")) {
                    //Construit la nouvelle URL avec le numéro de page et la valeur de 'pn' existante
                    newUrl = `https://www.amazon.fr/vine/orders?page=${pageNumber}`;
                }
                window.location.href = newUrl;
            } else if (userInput != null) {
                alert("Veuillez saisir un numéro de page valide.");
            }
        }

        //Fonction pour extraire le numéro de commande de l'URL
        function extractOrderId(url) {
            const match = url.match(/orderID=([0-9-]+)/);
            return match ? match[1] : null;
        }

        function extractASIN(input) {
            //Expression régulière pour identifier un ASIN dans une URL ou directement
            const regex = /\/dp\/([A-Z0-9]{10})|([A-Z0-9]{10})/;
            const match = input.match(regex);
            if (match) {
                return match[1] || match[2];
            }
            return null;
        }

        function fireWorks() {
            //Ajout de styles pour le feu d'artifice
            let style = document.createElement('style');
            style.innerHTML = `
        .firework {
            position: absolute;
            width: 4px;
            height: 4px;
            background: red;
            border-radius: 50%;
            pointer-events: none;
            animation: explode 1s ease-out forwards;
        }
        @keyframes explode {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            100% { transform: translate(var(--x, 0), var(--y, 0)) scale(0.5); opacity: 0; }
        }
    `;
            document.head.appendChild(style);

            //Fonction pour créer une particule de feu d'artifice
            function createParticle(x, y, color, angle, speed) {
                let particle = document.createElement('div');
                particle.className = 'firework';
                particle.style.background = color;
                particle.style.left = `${x}px`;
                particle.style.top = `${y}px`;

                //Calcul de la trajectoire
                let radians = angle * (Math.PI / 180);
                let dx = Math.cos(radians) * speed;
                let dy = Math.sin(radians) * speed;
                particle.style.setProperty('--x', `${dx}px`);
                particle.style.setProperty('--y', `${dy}px`);

                document.body.appendChild(particle);

                //Retirer la particule après l'animation
                setTimeout(() => {
                    particle.remove();
                }, 1000);
            }

            //Fonction pour lancer le feu d'artifice
            function lancerFeuArtifice() {
                let numberOfBursts = 10;
                let particlesPerBurst = 50;
                let burstInterval = 500; //Intervalle entre chaque explosion
                let duration = 5000; //Durée du feu d'artifice
                let colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

                let interval = setInterval(() => {
                    for (let i = 0; i < numberOfBursts; i++) {
                        let x = Math.random() * (window.innerWidth - 50) + 25;
                        let y = Math.random() * (window.innerHeight - 50) + 25;
                        let color = colors[Math.floor(Math.random() * colors.length)];

                        for (let j = 0; j < particlesPerBurst; j++) {
                            let angle = Math.random() * 360;
                            let speed = Math.random() * 100 + 50;
                            createParticle(x, y, color, angle, speed);
                        }
                    }
                }, burstInterval);

                setTimeout(() => {
                    clearInterval(interval);
                }, duration);
            }

            //Ajouter la fonction au contexte global pour pouvoir l'appeler facilement
            window.lancerFeuArtifice = lancerFeuArtifice;

            //Appeler la fonction pour démarrer automatiquement les feux d'artifice
            lancerFeuArtifice();
        }

        function addMail() {
            if (!window.location.href.includes('review-type=completed')) {
                const rows = document.querySelectorAll('.vvp-reviews-table--row');
                rows.forEach(row => {
                    //const productUrl = row.querySelector('.vvp-reviews-table--text-col a').href;
                    const productCell = row.querySelector('.vvp-reviews-table--text-col');
                    let asin;

                    if (productCell.querySelector('a')) {
                        //L'URL existe dans un lien, on extrait depuis l'href
                        const productUrl = productCell.querySelector('a').href;
                        asin = extractASIN(productUrl);
                    } else {
                        //Directement disponible comme texte dans la cellule
                        asin = extractASIN(productCell.textContent);
                    }
                    //const asin = extractASIN(productUrl);
                    const key_asin = "email_" + asin;
                    //Clé pour le numéro de commande
                    const orderKey_asin = "order_" + asin;

                    //Créer la checkbox
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = 'check_' + asin;
                    checkbox.style.margin = '7px';

                    //Définir la taille de la checkbox
                    checkbox.style.width = '15px';
                    checkbox.style.height = '15px';

                    //Créer la liste déroulante
                    const select = document.createElement('select');
                    select.id = 'reason_' + asin;

                    const defaultEmailTemplates = [
                        { title: 'Produit non reçu', text: 'Bonjour,\n\nJe n\'ai jamais reçu le produit suivant, pouvez-vous le retirer de ma liste ?\n\nCommande : $order\nASIN : $asin\n\nCordialement.' },
                        { title: 'Produit supprimé', text: 'Bonjour,\n\nLe produit suivant a été supprimé, pouvez-vous le retirer de ma liste ?\n\nCommande : $order\nASIN : $asin\n\nCordialement.' },
                        { title: 'Avis en doublon', text: 'Bonjour,\n\nJe ne peux pas déposer d\'avis sur le produit suivant, pouvez-vous le retirer de ma liste ?\n\nCommande : $order\nASIN : $asin\n\nCordialement.' }
                    ];
                    //Récupérer les modèles depuis localStorage
                    const emailTemplates = JSON.parse(localStorage.getItem('emailTemplates')) || defaultEmailTemplates;
                    if (!localStorage.getItem('emailTemplates')) {
                        localStorage.setItem('emailTemplates', JSON.stringify(defaultEmailTemplates));
                    }
                    emailTemplates.forEach(template => {
                        const option = document.createElement('option');
                        option.value = template.title;
                        option.textContent = template.title; //ou template.text selon ce que vous voulez afficher
                        select.appendChild(option);
                    });

                    //Gérer l'état initial à partir de localStorage
                    const storedData = JSON.parse(localStorage.getItem(key_asin));
                    if (storedData) {
                        checkbox.checked = true;
                        select.value = storedData.reason;
                    }

                    //Gérer l'activation de la liste déroulante
                    const orderDataExists = localStorage.getItem(orderKey_asin);
                    if (!orderDataExists) {
                        select.disabled = true; //Désactive la liste déroulante
                        select.innerHTML = '<option>Numéro de commande absent</option>';
                        checkbox.disabled = true; //Désactive la checkbox
                    } else {
                        const orderData = JSON.parse(orderDataExists);
                        //Active ou désactive la checkbox en fonction de son état actuel
                        checkbox.disabled = false; //Assure-toi que la checkbox est activée
                        select.disabled = !checkbox.checked; //Active ou désactive la liste déroulante basée sur l'état de la checkbox
                        var originalButton = row.querySelector('.vvp-reviews-table--actions-col');
                        if (originalButton) {
                            //Créez un nouveau bouton
                            var newButton = document.createElement('span');
                            newButton.className = 'a-button a-button-primary vvp-reviews-table--action-btn';
                            newButton.style.display = 'block'; //Assurez le retour à la ligne
                            newButton.style.marginTop = '5px'; //Espacement en haut

                            //Créez l'intérieur du bouton
                            var buttonInner = document.createElement('span');
                            buttonInner.className = 'a-button-inner';
                            newButton.appendChild(buttonInner);

                            //Créez le lien et ajustez l'URL
                            var link = document.createElement('a');
                            link.className = 'a-button-text';
                            link.id = 'order-details-link';
                            link.textContent = 'Voir la commande';
                            //Assurez-vous que l'orderId est correctement défini ici
                            link.href = "https://www.amazon.fr/gp/your-account/order-details?ie=UTF8&orderID=" + orderData.orderId;
                            link.target = '_blank';

                            buttonInner.appendChild(link);

                            //Insérez le nouveau bouton après le bouton existant
                            originalButton.appendChild(newButton);
                        }
                    }

                    //Écouter les changements de checkbox
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            //Activer la liste déroulante
                            select.disabled = false;
                            const reason = select.value;
                            localStorage.setItem(key_asin, JSON.stringify({ asin, reason }));
                        } else {
                            //Désactiver la liste déroulante
                            select.disabled = true;
                            localStorage.removeItem(key_asin);
                        }
                    });

                    //Sauvegarder les modifications de la liste déroulante
                    select.addEventListener('change', () => {
                        if (checkbox.checked) {
                            const reason = select.value;
                            localStorage.setItem(key_asin, JSON.stringify({ asin, reason }));
                        }
                    });

                    //Ajouter les éléments à la ligne
                    const actionCol = row.querySelector('.vvp-reviews-table--actions-col');
                    const inlineContainer = document.createElement('div');
                    inlineContainer.style.display = 'flex';
                    inlineContainer.style.flexFlow = 'row nowrap'; //Force les éléments à s'aligner horizontalement
                    inlineContainer.style.alignItems = 'center'; //Aligner les éléments verticalement

                    //Ajoute la checkbox et la liste déroulante au nouveau div
                    inlineContainer.appendChild(checkbox);
                    inlineContainer.appendChild(select);
                    //Ajouter le nouveau div au conteneur d'actions existant
                    actionCol.appendChild(inlineContainer);
                });
                addEmailButton();
            }
        }

        function addEmailButton() {
            let header = document.querySelector('.vvp-reviews-table--heading-top');
            if (isMobile()) {
                //On rend visible le header qui est caché par défaut
                const header = document.querySelector('.vvp-reviews-table--heading-top');
                if (header) header.style.display = 'block';
            }
            //Créer un conteneur pour le bouton et l'email qui seront alignés à droite
            const actionsContainer = document.createElement('div');
            if (isMobile()) {
                actionsContainer.style.cssText = 'right: 0; top: 0;';
            } else {
                actionsContainer.style.cssText = 'text-align: right; position: absolute; right: 0; top: 0;';
            }

            //Bouton 'Générer email'
            const button = document.createElement('span');
            button.className = 'a-button a-button-primary vvp-reviews-table--action-btn';
            button.style.marginRight = '10px'; //Marge à droite du bouton
            button.style.marginTop = '10px'; //Marge en haut du bouton
            button.style.marginBottom = '5px'; //Marge en haut du bouton
            button.style.paddingLeft = '12px';
            button.style.paddingRight = '12px';
            const buttonInner = document.createElement('span');
            buttonInner.className = 'a-button-inner';
            const buttonText = document.createElement('a');
            buttonText.className = 'a-button-text';
            buttonText.textContent = 'Générer email';
            buttonText.href = 'javascript:void(0)';
            buttonText.addEventListener('click', function() {
                const emailText = generateEmail();
                navigator.clipboard.writeText(emailText).then(() => {
                    if (emailText != null) {
                        alert("Le texte suivant vient d'être copié dans le presse-papiers afin que tu puisses l'envoyer par mail au support :\n\n" + emailText);
                        window.location.reload();
                    }
                }).catch(err => {
                    console.error('[ReviewRemember] Erreur lors de la copie :', err);
                });
            });
            //Réduction du padding sur `buttonText`
            buttonText.style.paddingLeft = '2px'; //Ajustez selon vos besoins
            buttonText.style.paddingRight = '2px'; //Ajustez selon vos besoins

            buttonInner.style.paddingLeft = '0px'; //Enlève le padding à gauche
            buttonInner.style.paddingRight = '0px'; //Enlève le padding à droite

            buttonInner.appendChild(buttonText);
            button.appendChild(buttonInner);

            //Conteneur et style pour l'email
            const emailSpan = document.createElement('div');
            emailSpan.innerHTML = 'Support : <a href="javascript:void(0)" style="text-decoration: underline; color: #007FFF;">vine-support@amazon.fr</a>';
            emailSpan.style.marginRight = '5px';
            //Gestionnaire d'événements pour copier l'email
            const emailLink = emailSpan.querySelector('a');
            emailLink.addEventListener('click', function() {
                navigator.clipboard.writeText('vine-support@amazon.fr').then(() => {
                    alert('Email copié dans le presse-papiers');
                }).catch(err => {
                    console.error('[ReviewRemember] Erreur lors de la copie :', err);
                });
            });

            //Ajouter le bouton et l'email au conteneur d'actions
            actionsContainer.appendChild(button);
            actionsContainer.appendChild(emailSpan);
            //Ajouter le conteneur d'actions à l'en-tête
            if (header) {
                header.style.position = 'relative'; //S'assure que le positionnement absolu de actionsContainer fonctionne correctement
                header.appendChild(actionsContainer);
            }
        }

        function generateEmail() {
            //Trouver tous les ASINs cochés dans localStorage
            const keys = Object.keys(localStorage);
            const checkedAsins = keys.filter(key => key.startsWith("email_") && localStorage.getItem(key));
            const emailData = checkedAsins.map(key => {
                const asin = key.split("_")[1];
                const data = JSON.parse(localStorage.getItem(key));
                const orderData = JSON.parse(localStorage.getItem("order_" + asin));
                const selectedTemplate = JSON.parse(localStorage.getItem('emailTemplates')).find(t => t.title === data.reason);
                return { asin, reason: data.reason, orderData, selectedTemplate, key };
            });

            if (emailData.length === 0) {
                alert("Aucun produit n'est sélectionné pour l'envoi d'email.");
                return null;
            }

            if (emailData.length === 1) {
                //Utiliser le modèle spécifique pour un seul produit
                const { asin, reason, orderData, selectedTemplate, key } = emailData[0];

                if (selectedTemplate && orderData) {
                    let emailText = selectedTemplate.text.replace(/\$asin/g, asin)
                    .replace(/\$(commande|order|cmd)/gi, orderData.orderId)
                    .replace(/\$(nom|name|titre|title)/gi, orderData.productName)
                    .replace(/\$(date)/gi, orderData.orderDate)
                    .replace(/\$(reason|raison)/gi, reason);
                    //navigator.clipboard.writeText(emailText);
                    //alert(emailText);
                    localStorage.removeItem(key);
                    //window.location.reload();
                    return emailText;
                } else {
                    alert("Il manque des données pour générer l'email.");
                }
            } else {
                //Utiliser le modèle multiproduits
                var multiProductTemplate = JSON.parse(localStorage.getItem('multiProductEmailTemplate'));
                if (!multiProductTemplate) {
                    initmultiProductTemplate();
                    multiProductTemplate = JSON.parse(localStorage.getItem('multiProductEmailTemplate'));
                }
                let emailText = multiProductTemplate.text;
                const productDetailsSegmentMatch = emailText.match(/\$debut(.*?)\$fin/s);
                if (!productDetailsSegmentMatch) {
                    alert("Le modèle d'email multiproduits est mal formé ou les balises $debut/$fin sont absentes.");
                    return;
                }
                const productDetailsSegment = productDetailsSegmentMatch[1];

                const productDetails = emailData.map(({ asin, orderData, reason }) => {
                    if (!orderData) return "Données manquantes pour un ou plusieurs produits.";

                    return productDetailsSegment
                        .replace(/\$asin/g, asin)
                        .replace(/\$(commande|order|cmd)/gi, orderData.orderId)
                        .replace(/\$(nom|name|titre|title)/gi, orderData.productName)
                        .replace(/\$(date)/gi, orderData.orderDate)
                        .replace(/\$(reason|raison)/gi, reason);
                }).join("");

                emailText = emailText.replace(/\$debut.*?\$fin/s, productDetails);
                //navigator.clipboard.writeText(emailText);
                //alert(emailText);
                //Supprimer les données des checkbox après la génération de l'email pour tous les ASINs concernés
                emailData.forEach(({ key }) => {
                    localStorage.removeItem(key);
                });
                //window.location.reload();
                return emailText;
            }
        }

        //localStorage.removeItem('enableDateFunction');
        var enableDateFunction = localStorage.getItem('enableDateFunction');
        var enableReviewStatusFunction = localStorage.getItem('enableReviewStatusFunction');
        var filterEnabled = localStorage.getItem('filterEnabled');
        var hidePendingEnabled = localStorage.getItem('hidePendingEnabled');
        var profilEnabled = localStorage.getItem('profilEnabled');
        //var footerEnabled = localStorage.getItem('footerEnabled');
        var footerEnabled = 'false';
        var pageEnabled = localStorage.getItem('pageEnabled');
        var emailEnabled = localStorage.getItem('emailEnabled');
        var lastUpdateEnabled = localStorage.getItem('lastUpdateEnabled');
        var evaluationBreakdownEnabled = localStorage.getItem('evaluationBreakdownEnabled');
        var evaluationBreakdownMode = localStorage.getItem('evaluationBreakdownMode');
        var targetPercentageEnabled = localStorage.getItem('targetPercentageEnabled');
        var hideHighlightedReviewsEnabled = localStorage.getItem('hideHighlightedReviewsEnabled');
        var autoSaveEnabled = localStorage.getItem('autoSaveEnabled');

        //Initialiser à true si la clé n'existe pas dans le stockage local
        if (enableDateFunction === null) {
            enableDateFunction = 'true';
            localStorage.setItem('enableDateFunction', enableDateFunction);
        }

        if (enableReviewStatusFunction === null) {
            enableReviewStatusFunction = 'true';
            localStorage.setItem('enableReviewStatusFunction', enableReviewStatusFunction);
        }

        if (reviewColor === null) {
            reviewColor = '#0000FF';
            localStorage.setItem('reviewColor', reviewColor);
        }

        if (filterEnabled === null) {
            filterEnabled = 'true';
            localStorage.setItem('filterEnabled', filterEnabled);
        }

        if (hidePendingEnabled === null) {
            hidePendingEnabled = 'false';
            localStorage.setItem('hidePendingEnabled', hidePendingEnabled);
        }

        if (profilEnabled === null) {
            profilEnabled = 'true';
            localStorage.setItem('profilEnabled', profilEnabled);
        }

        if (footerEnabled === null) {
            footerEnabled = 'false';
            localStorage.setItem('footerEnabled', footerEnabled);
        }

        if (pageEnabled === null) {
            pageEnabled = 'true';
            localStorage.setItem('pageEnabled', pageEnabled);
        }

        if (emailEnabled === null) {
            emailEnabled = 'true';
            localStorage.setItem('emailEnabled', emailEnabled);
        }

        if (lastUpdateEnabled === null) {
            lastUpdateEnabled = 'true';
            localStorage.setItem('lastUpdateEnabled', lastUpdateEnabled);
        }

        if (evaluationBreakdownEnabled === null) {
            evaluationBreakdownEnabled = 'true';
            localStorage.setItem('evaluationBreakdownEnabled', evaluationBreakdownEnabled);
        }

        if (evaluationBreakdownMode === null) {
            evaluationBreakdownMode = 'current';
            localStorage.setItem('evaluationBreakdownMode', evaluationBreakdownMode);
        }

        if (targetPercentageEnabled === null) {
            targetPercentageEnabled = 'true';
            localStorage.setItem('targetPercentageEnabled', targetPercentageEnabled);
            localStorage.setItem('gestavisTargetPercentage', '90');
            localStorage.setItem('doFireWorks', 'true');
        }

        if (hideHighlightedReviewsEnabled === null) {
            hideHighlightedReviewsEnabled = 'false';
            localStorage.setItem('hideHighlightedReviewsEnabled', hideHighlightedReviewsEnabled);
        }

        if (autoSaveEnabled === null) {
            autoSaveEnabled = 'true';
            localStorage.setItem('autoSaveEnabled', autoSaveEnabled);
        }

        if (isMobile()) {
            pageX = "X";
        }

        if (enableDateFunction === 'true') {
            highlightDates();
        }

        if (enableReviewStatusFunction === 'true') {
            highlightReviewStatus();
        }

        if (hidePendingEnabled === 'true') {
            addHidePendingCheckboxes();
        }

        if (filterEnabled === 'true') {
            masquerLignesApprouve();
        }

        if (pageEnabled === 'true') {
            addPage();
        }

        if (enableReviewStatusFunction === 'true' || enableDateFunction === 'true') {
            highlightUnavailableStatus();
        }

        if (profilEnabled === 'true') {
            changeProfil();
        }

        if (emailEnabled === 'true') {
            addMail();
        }

        if (lastUpdateEnabled === 'true' || evaluationBreakdownEnabled === 'true') {
            lastUpdate(lastUpdateEnabled === 'true', evaluationBreakdownEnabled === 'true');
        }

        if (targetPercentageEnabled === 'true') {
            targetPercentage();
        }

        if (hideHighlightedReviewsEnabled === 'true') {
            hideHighlightedReviews();
        }

        if (autoSaveEnabled === 'true') {
            autoSaveReview();
        }

        addReviewScanButtons();
        handleReviewScanIfNeeded();
        initQualityEvaluationSync();
        //End

        let buttonsAdded = false; //Suivre si les boutons ont été ajoutés

        function tryToAddButtons() {
            if (buttonsAdded) return; //Arrêtez si les boutons ont déjà été ajoutés

            const submitButtonArea =
                  document.querySelector(selectorButtons) ||
                  document.querySelector(selectorButtonsOld);
            if (submitButtonArea) {
                addButtons(submitButtonArea);
                buttonsAdded = true; //Marquer que les boutons ont été ajoutés
                //Agrandir la zone pour le texte de l'avis
                const textarea = document.getElementById('reviewText');
                if (textarea) {
                    textarea.style.height = '300px'; //Définit la hauteur à 300px
                    textarea.style.resize = 'both';
                    //Ajoute un compteur de caractères en temps réel sous la zone de texte
                    if (!document.getElementById('rr-char-counter')) {
                        const counter = document.createElement('div');
                        counter.id = 'rr-char-counter';
                        counter.style.marginTop = '8px';
                        counter.style.fontSize = '12px';
                        counter.style.color = '#565959';
                        counter.textContent = `Caractères : ${textarea.value.length}`;
                        textarea.insertAdjacentElement('afterend', counter);

                        const updateCounter = () => {
                            counter.textContent = `Caractères : ${textarea.value.length}`;
                        };

                        textarea.addEventListener('input', updateCounter);
                        textarea.addEventListener('change', updateCounter);
                    }
                }
                //Ajout multiple de fichiers média (nouveau comportement)
                var inputElement = document.querySelector(
                    'input[data-testid="in-context-ryp__form-field--mediaUploadInputHidden"], #media'
                );
                if (inputElement) {
                    inputElement.setAttribute('multiple', '');

                    //Gestion du glisser-déposer d'images
                    let isProcessingUpload = false;
                    const dropZone =
                          document.querySelector('div[data-testid="in-context-ryp__form-field--mediaUpload"]') ||
                          inputElement.closest('label') ||
                          inputElement.parentElement;
                    if (dropZone) {
                        const styleDrag = document.createElement('style');
                        styleDrag.textContent = '.rr-dragover { outline: 2px dashed #1E90FF; }';
                        document.head.appendChild(styleDrag);
                        ['dragenter', 'dragover'].forEach(function (evt) {
                            dropZone.addEventListener(evt, function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                dropZone.classList.add('rr-dragover');
                            });
                        });
                        ['dragleave', 'drop'].forEach(function (evt) {
                            dropZone.addEventListener(evt, function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                dropZone.classList.remove('rr-dragover');
                            });
                        });
                        dropZone.addEventListener('drop', function (e) {
                            if (isProcessingUpload) return;
                            const dt = new DataTransfer();
                            Array.from(e.dataTransfer.files).forEach(function (file) {
                                dt.items.add(file);
                            });
                            inputElement.files = dt.files;
                            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                    }

                    //Permet de téléverser séquentiellement les fichiers sélectionnés
                    inputElement.addEventListener('change', async function (e) {
                        if (isProcessingUpload) return;
                        e.stopImmediatePropagation();
                        e.preventDefault();

                        let files = Array.from(inputElement.files);

                        //Affichage de la barre de progression
                        let progressDiv;
                        if (files.length > 0) {
                            progressDiv = document.createElement('div');
                            progressDiv.id = 'rr-upload-progress';
                            progressDiv.style.position = 'fixed';
                            progressDiv.style.bottom = '50%';
                            progressDiv.style.right = '50%';
                            progressDiv.style.background = 'rgba(0,0,0,0.7)';
                            progressDiv.style.color = '#fff';
                            progressDiv.style.padding = '10px';
                            progressDiv.style.zIndex = '10000';
                            progressDiv.style.borderRadius = '5px';
                            progressDiv.style.whiteSpace = 'pre-line';
                            progressDiv.textContent = `Envoi en cours...\n0/${files.length}`;
                            document.body.appendChild(progressDiv);
                        }

                        //Conversion des fichiers HEIC en JPEG
                        for (let i = 0; i < files.length; i++) {
                            const f = files[i];
                            const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || /\.heic$/i.test(f.name) || /\.heif$/i.test(f.name);
                            if (isHeic) {
                                try {
                                    const blob = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
                                    const newName = f.name.replace(/\.(heic|heif)$/i, '.jpg');
                                    files[i] = new File([blob], newName, { type: 'image/jpeg' });
                                } catch (err) {
                                    console.error('[ReviewRemember] Erreur de conversion HEIC', err);
                                }
                            }
                        }

                        if (files.length > 1) {
                            e.preventDefault();
                            e.stopPropagation();
                            let index = 0;

                            const uploadNext = () => {
                                if (index >= files.length) {
                                    isProcessingUpload = false;
                                    if (progressDiv) progressDiv.remove();
                                    return;
                                }

                                const dt = new DataTransfer();
                                dt.items.add(files[index]);
                                index++;
                                inputElement.files = dt.files;
                                inputElement.dispatchEvent(new Event('change', { bubbles: true }));

                                if (progressDiv) {
                                    progressDiv.textContent = `Envoi en cours...\n${index}/${files.length}`;
                                }

                                //Délai aléatoire pour éviter un rythme trop régulier
                                const randomDelay = 1000 + Math.random() * 2000; //1 à 3 secondes
                                setTimeout(uploadNext, randomDelay);
                            };

                            isProcessingUpload = true;
                            uploadNext();
                        } else if (files.length === 1) {
                            const dt = new DataTransfer();
                            dt.items.add(files[0]);
                            isProcessingUpload = true;
                            inputElement.files = dt.files;
                            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                            if (progressDiv) {
                                progressDiv.textContent = `Envoi en cours...\n1/1`;
                                setTimeout(() => progressDiv.remove(), 500);
                            }
                            isProcessingUpload = false;
                        }
                    });
                }
            } else {
                setTimeout(tryToAddButtons, 100); //Réessayer après un demi-seconde
            }
        }

        tryToAddButtons();

        //Suppression du footer uniquement sur les PC (1000 étant la valeur pour "Version pour ordinateur" sur Kiwi à priori)
        if (window.innerWidth > 768 && window.innerWidth != 1000 && window.innerWidth != 1100 && window.location.href.startsWith("https://www.amazon.fr/gp/profile/") && footerEnabled === 'true') {
            //Votre code de suppression du footer ici
            var styleFooter = document.createElement('style');
            styleFooter.textContent = `
        #rhf, #rhf-shoveler, .rhf-frame, #navFooter {
            display: none !important;
        }
        footer.nav-mobile.nav-ftr-batmobile {
            display: none !important;
        }
    `;
            document.head.appendChild(styleFooter);
        }

        //Suppression footer partout sauf sur le profil car configurable
        if (!window.location.href.startsWith("https://www.amazon.fr/gp/profile/")) {
            var supFooter = document.createElement('style');

            supFooter.textContent = `
        #rhf, #rhf-shoveler, .rhf-frame, #navFooter {
            display: none !important;
        }
        footer.nav-mobile.nav-ftr-batmobile {
            display: none !important;
        }
`
            document.head.appendChild(supFooter);
        }

        window.addEventListener('load', function () {

            if (document.URL !== "https://www.amazon.fr/vine/account") {
                return;
            }

            if (!document.getElementById('rr-compact-metrics-style')) {
                const style = document.createElement('style');
                style.id = 'rr-compact-metrics-style';
                style.textContent = `
#vvp-vine-account-details-box .a-box-inner,
#vvp-vine-activity-metrics-box .a-box-inner {
    padding: 8px 10px !important;
}

#vvp-vine-account-details-box .a-scroller,
#vvp-vine-activity-metrics-box .a-scroller {
    padding: 0 !important;
}

#vvp-vine-account-details-box .metrics-display,
#vvp-vine-activity-metrics-box .metrics-display {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

#vvp-vine-account-details-box .metrics-display p,
#vvp-vine-activity-metrics-box .metrics-display p {
    margin: 2px 0;
    line-height: 1.25;
}

#vvp-vine-account-details-box .metrics-display hr,
#vvp-vine-activity-metrics-box .metrics-display hr {
    margin: 6px 0;
}

#vvp-vine-account-details-box .review-todo,
#vvp-vine-activity-metrics-box .review-todo,
#vvp-vine-account-details-box .rr-evaluation-breakdown,
#vvp-vine-activity-metrics-box .rr-evaluation-breakdown,
#vvp-vine-account-details-box .last-modification,
#vvp-vine-activity-metrics-box .last-modification {
    margin-top: 4px !important;
    line-height: 1.25;
}

#vvp-vine-account-details-box .metrics-display p:empty,
#vvp-vine-activity-metrics-box .metrics-display p:empty,
#vvp-vine-account-details-box .metrics-display p:empty + br,
#vvp-vine-activity-metrics-box .metrics-display p:empty + br,
#vvp-vine-account-details-box .a-ws-row > .a-column > p:empty,
#vvp-vine-activity-metrics-box .a-ws-row > .a-column > p:empty,
#vvp-vine-account-details-box .a-ws-row > .a-column > br,
#vvp-vine-activity-metrics-box .a-ws-row > .a-column > br {
    display: none !important;
}

#vvp-vine-account-details-box .status-bar,
#vvp-vine-activity-metrics-box .status-bar,
#vvp-vine-account-details-box .animated-progress-bar,
#vvp-vine-activity-metrics-box .animated-progress-bar {
    margin: 2px 0;
}
`;

                document.head.appendChild(style);
            }

            //Déplacer "Testeur Vine depuis" sous "Mon statut Vine"
            (function rrMoveVineSince() {
                const strong = [...document.querySelectorAll('p.a-nowrap strong')]
                .find(s => (s.textContent || '').trim().startsWith('Testeur Vine depuis'));
                if (!strong) {
                    setTimeout(rrMoveVineSince, 250);
                    return;
                }

                const p = strong.closest('p');
                if (!p || p.dataset.rrMoved === '2') {
                    return;
                }

                //Colonne "Mon statut Vine" (celle qui contient le titre)
                const titleNode = [...document.querySelectorAll('#vvp-vine-account-details-box .a-row.a-size-extra-large')]
                .find(el => (el.textContent || '').trim() === 'Mon statut Vine');
                const statusCol = titleNode ? titleNode.closest('.a-column') : null;

                if (!statusCol) {
                    setTimeout(rrMoveVineSince, 250);
                    return;
                }

                p.dataset.rrMoved = '2';
                p.style.marginTop = '8px';
                statusCol.appendChild(p);
            })();


            //Active le bouton de téléchargement du rapport
            var element = document.querySelector('.vvp-tax-report-file-type-select-container.download-disabled');
            if (element) {
                element.classList.remove('download-disabled');
            }

            //Ajoute l'heure de l'évaluation
            const timeStampElementEnd = document.getElementById('vvp-eval-end-stamp');
            const timeStampElementJoin = document.getElementById('vvp-join-vine-stamp');
            //const timeStampElementEnd = document.getElementById('vvp-eval-end-stamp');
            const timeStampEnd = timeStampElementEnd ? timeStampElementEnd.textContent : null;
            const timeStampJoin = timeStampElementJoin ? timeStampElementJoin.textContent : null;

            if (timeStampEnd) {
                const date = new Date(parseInt(timeStampEnd));
                const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric' };
                const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
                const formattedDate = date.toLocaleDateString('fr-FR', optionsDate) + ' à ' + date.toLocaleTimeString('fr-FR', optionsTime);

                const dateStringElement = document.getElementById('vvp-evaluation-date-string');
                if (dateStringElement) {
                    dateStringElement.innerHTML = `Réévaluation&nbsp;: <strong>${formattedDate}</strong>`;
                }
            }

            if (timeStampJoin) {
                const date = new Date(parseInt(timeStampJoin));
                const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric' };
                const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
                const formattedDate = date.toLocaleDateString('fr-FR', optionsDate) + ' à ' + date.toLocaleTimeString('fr-FR', optionsTime);

                const dateStringElement = document.getElementById('vvp-member-since-display');
                if (dateStringElement) {
                    dateStringElement.innerHTML = `Membre depuis&nbsp;: <strong>${formattedDate}</strong>`;
                }
            }

            //Suppression du bouton pour se désincrire
            var elem = document.getElementById('vvp-opt-out-of-vine-button');
            if (elem) {
                elem.style.display = 'none';
            }

            storeEvaluationStartStamp();
        });
    }
    var RREnabled = localStorage.getItem('RREnabled');
    if (RREnabled === null) {
        RREnabled = 'true';
        localStorage.setItem('RREnabled', RREnabled);
    }
    if (RREnabled === 'true') {
        if (document.readyState !== 'loading') {
            initReviewRemember();
        } else {
            window.addEventListener('DOMContentLoaded', initReviewRemember);
        }
    }
    window.createConfigPopupRR = createConfigPopupRR;
})();
