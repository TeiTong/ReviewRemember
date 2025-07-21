//==UserScript==
// @name         ReviewRememberPM
// @namespace    http://tampermonkey.net/
// @version      1.8.7
// @description  Outils pour les avis Amazon (version PickMe)
// @author       Créateur/Codeur principal : MegaMan / Codeur secondaire : Sulff
// @match        https://www.amazon.fr/review/create-review*
// @match        https://www.amazon.fr/reviews/edit-review*
// @match        https://www.amazon.fr/vine/vine-reviews*
// @match        https://www.amazon.fr/vine/account
// @match        https://www.amazon.fr/gp/profile/*
// @match        https://www.amazon.fr/vine/orders*
// @match        https://www.amazon.fr/gp/profile/*
// @match        https://www.amazon.fr/vine/resources
// @icon         https://vinepick.me/img/RR-ICO-2.png
// @updateURL    https://raw.githubusercontent.com/teitong/reviewremember/main/ReviewRememberPM.user.js
// @downloadURL  https://raw.githubusercontent.com/teitong/reviewremember/main/ReviewRememberPM.user.js
// @require      https://vinepick.me/scripts/heic2any.min.js
// @grant        GM_registerMenuCommand
// @run-at       document-end
//==/UserScript==

(function() {

    'use strict';
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

    //Export des avis
    function exportReviewsToCSV() {
        let csvContent = "\uFEFF"; // BOM pour UTF-8

        //Ajouter l'en-tête du CSV
        csvContent += "Type;Nom;ASIN;Titre de l'avis;Contenu de l'avis\n";

        //Exporter les modèles
        let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];
        savedTemplates.forEach(template => {
            const { name, title, review } = template;
            //Ajoute une ligne détaillée pour chaque modèle avec une colonne vide pour ASIN
            csvContent += `Modèle;${name};;${title.replace(/;/g, ',')};${review.replace(/\n/g, '\\n')}\n`;
        });

        //Itérer sur les éléments de localStorage
        Object.keys(localStorage).forEach(function(key) {
            if (key.startsWith('review_') && key !== 'review_templates') {
                const reviewData = JSON.parse(localStorage.getItem(key));
                const asin = key.replace('review_', ''); // Extraire l'ASIN
                const title = reviewData.title.replace(/;/g, ','); // Remplacer les ";" par des ","
                const review = reviewData.review.replace(/\n/g, '\\n');

                //Ajouter la ligne pour les avis
                csvContent += `Avis;;${asin};${title};${review}\n`;
            }
        });

        //Créer un objet Blob avec le contenu CSV en spécifiant le type MIME
        var blob = new Blob([csvContent], {type: "text/csv;charset=utf-8;"});
        var url = URL.createObjectURL(blob);

        //Créer un lien pour télécharger le fichier
        var link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "RR_backup.csv");
        document.body.appendChild(link); // Nécessaire pour certains navigateurs

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
                    if (columns.length >= 4) { // On s'assure qu'il y a assez de colonnes
                        const type = columns[0].trim();
                        const name = columns[1].trim();
                        const asin = columns[2].trim();
                        const title = columns[3].trim();
                        const review = columns[4].trim().replace(/\\n/g, '\n'); // Remplacer \\n par de vrais retours à la ligne

                        if (type === "Avis") {
                            //Sauvegarder l'avis
                            localStorage.setItem(`review_${asin}`, JSON.stringify({ title, review }));
                        } else if (type === "Modèle") {
                            //Ajouter ou remplacer le modèle dans le tableau
                            let savedTemplates = JSON.parse(localStorage.getItem('review_templates')) || [];

                            //Vérifier si un modèle avec le même nom existe déjà
                            const existingIndex = savedTemplates.findIndex(template => template.name === name);

                            if (existingIndex !== -1) {
                                //Remplacer le modèle existant
                                savedTemplates[existingIndex] = { name, title, review };
                            } else {
                                //Ajouter un nouveau modèle
                                savedTemplates.push({ name, title, review });
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
            if (key.startsWith('review_')) {
                localStorage.removeItem(key);
            }
        });
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
            console.log("Impossible de trouver reviewTextarea, reviewTitle ou boutonContainer.");
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
            localStorage.setItem(`review_${asin}`, JSON.stringify({ title, review }));
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

        //Bouton pour sauvegarder l'avis
        addButton('Sauvegarder l\'avis', saveReview, thirdLineContainer);

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
        // Ajouter les boutons à l'élément cible
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
    <h2 id="configPopupHeader">Paramètres ReviewRemember<span id="closePopupRR" style="float: right; cursor: pointer;">&times;</span></h2>
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
      ${createCheckbox('RREnabled', 'Activer ReviewRemember', 'Active le module ReviewRemeber qui permet de gérer les avis produits (sauvegardes, modèles, génération de mails, ...)')}
      ${createCheckbox('autoSaveEnabled', 'Sauvegarde automatique des avis', 'Les avis sont sauvegardés dès que vous cliquez sur "Envoyer" sans avoir besoin de l\'enregistrer avant')}
      ${createCheckbox('enableDateFunction', 'Surlignage du statut des avis', 'Change la couleur du "Statut du commentaire" dans vos avis "En attente de vérification" en fonction de leur date d\'ancienneté. Entre 0 et 6 jours -> Bleu, 7 à 13 jours -> Vert, 14 à 29 jours -> Orange, plus de 30 jours -> Rouge')}
      ${createCheckbox('enableReviewStatusFunction', 'Surlignage des avis vérifiés', 'Change la couleur du "Statut du commentaire" dans vos avis "Vérifiées" en fonction de leur statut actuel (Approuvé, Non approuvé, etc...)')}
      ${createCheckbox('enableColorFunction', 'Changer la couleur de la barre de progression des avis', 'Change la couleur de la barre de progression des avis sur la page "Compte". Entre 0 et 59% -> Rouge, 60 à 89% -> Orange et supérieur à 90% -> Vert')}
      ${createCheckbox('filterEnabled', 'Cacher les avis approuvés', 'Dans l\'onglet "Vérifiées" de vos avis, si l\'avis  est Approuvé, alors il est caché')}
      ${createCheckbox('lastUpdateEnabled', 'Afficher la date de la dernière modification du % d\'avis', 'Indique la date de la dernière modification du % des avis sur le compte')}
      ${createCheckbox('targetPercentageEnabled', 'Afficher le nombre d\'avis nécessaires pour atteindre un % cible', 'Affiche le nombre d\'avis qu\'il va être nécessaire de faire pour atteindre le % défini')}
      ${createCheckbox('headerEnabled', 'Cacher totalement l\'entête de la page', 'Cache le haut de la page Amazon, celle avec la zone de recherche et les menus')}
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
        //Choisis la couleur ici. Options: 'black', 'white', 'gray'
        const color = 'gray'; //Exemple: change cette valeur pour 'black', 'white', ou une autre couleur CSS valide

        //Génération de l'ID unique pour le span d'aide
        const helpSpanId = `help-span-${name}`;

        //Icône d'aide avec gestionnaire d'événements attaché via addEventListener
        const helpIcon = explanation ? `<span id="${helpSpanId}" style="text-decoration: none; cursor: help; margin-left: 4px; color: ${color}; font-size: 16px;">?</span>` : '';
        const checkboxHtml = `<label class="${isDisabled ? 'disabled' : ''}">
              <input type="checkbox" id="${name}" name="${name}" ${isChecked} ${isDisabled}>
              ${label} ${helpIcon}
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

    function initReviewRemember() {

        //Correction du mot sur la page
        var element = document.querySelector('#vvp-reviews-button--completed a.a-button-text');

        //Vérifie si l'élément existe et si son texte est "Vérifiées"
        if (element && element.textContent.trim() === "Vérifiées") {
            //Modifie le texte en "Vérifiés"
            element.textContent = "Vérifiés";
        }

        //Sélectionne tous les liens qui ont des IDs correspondant au pattern "a-autoid-*-announce" pour modifier le texte
        var links = document.querySelectorAll('.vvp-reviews-table--action-btn .a-button-text');

        //Boucle à travers chaque lien pour changer le texte
        links.forEach(function(link) {
            if (link.textContent.trim() === "Donner un avis sur l'article") {
                link.textContent = "Donner un avis";
            } else if (link.textContent.trim() === "Modifier le commentaire") {
                link.textContent = "Modifier l'avis";
            }
        });

        links = document.querySelectorAll('.vvp-orders-table--action-btn .a-button-text');

        //Boucle à travers chaque lien pour changer le texte
        links.forEach(function(link) {
            if (link.textContent.trim() === "Détails de la commande") {
                link.textContent = "Détails";
            }
        });

        //On initialise les infos pour la version mobile (ou non)
        var pageX = "Page X";

        //Trie des avis sur profil
        //Marquer une carte comme traitée
        function marquerCarteCommeTraitee(carte) {
            carte.dataset.traitee = 'true';
        }

        //Fonction pour classer les cartes traitées par ordre décroissant de leur valeur
        function classerCartesTraitees() {
            //Sélectionne uniquement les cartes marquées comme traitées
            const cartesTraitees = Array.from(document.querySelectorAll('.review-card-container[data-traitee="true"]'));

            //Trie les cartes en fonction de leur valeur numérique de manière croissante
            cartesTraitees.sort((a, b) => extraireValeur(a) - extraireValeur(b));

            //Réorganise les cartes dans leur conteneur parent selon le nouvel ordre croissant
            const conteneur = document.querySelector('#reviewTabContentContainer');
            cartesTraitees.forEach(carte => conteneur.prepend(carte));
        }

        //Extraire la valeur numérique d'un "like", retourne 0 si non applicable
        function extraireValeur(carte) {
            const valeurElement = carte.querySelector('.review-reaction-count');
            return valeurElement ? parseInt(valeurElement.innerText.trim(), 10) : 0;
        }

        //Fonction principale de réorganisation des cartes
        function reorganiserCartes() {
            //Sélectionne uniquement les cartes pas encore traitées
            const cartes = Array.from(document.querySelectorAll('.review-card-container:not([data-traitee="true"])'));

            //Filtre les cartes avec une valeur numérique strictement supérieure à 0
            const cartesAvecValeur = cartes.filter(carte => extraireValeur(carte) > 0);

            if (cartesAvecValeur.length > 0) {
                //Trie les cartes en fonction de leur valeur numérique de manière décroissante
                cartesAvecValeur.sort((a, b) => extraireValeur(b) - extraireValeur(a));

                //Préfixe les cartes triées au début de leur conteneur parent
                const conteneur = document.querySelector('#reviewTabContentContainer');
                cartesAvecValeur.forEach(carte => {
                    marquerCarteCommeTraitee(carte);
                    carte.style.setProperty('border', `3px solid ${reviewColor}`, 'important');
                    conteneur.prepend(carte);
                });

                //Réorganiser les cartes traitées par ordre croissant
                classerCartesTraitees();
            }
        }

        //Détecter les changements dans le DOM et appliquer le tri
        function changeProfil() {
            if (window.location.href.startsWith('https://www.amazon.fr/gp/profile')) {
                //Configuration de l'observer pour réagir aux modifications du DOM
                const observer = new MutationObserver((mutations) => {
                    let mutationsAvecAjouts = mutations.some(mutation => mutation.addedNodes.length > 0);

                    if (mutationsAvecAjouts) {
                        reorganiserCartes();
                    }
                });

                //Observer les changements dans le DOM
                observer.observe(document.querySelector('#reviewTabContentContainer'), { childList: true, subtree: true });

                //Exécution initiale au cas où des cartes seraient déjà présentes
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
        //Fonction pour changer la couleur de la barre en fonction du pourcentage
        function changeColor() {
            if (document.URL === "https://www.amazon.fr/vine/account") {
                var progressBar = document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress span');
                var progressValue = parseFloat(progressBar.getAttribute('data-progress'));

                var color = '';
                var width = progressBar.style.width;
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
        function lastUpdate() {
            if (document.URL === "https://www.amazon.fr/vine/account") {
                //Récupérer le pourcentage et la date précédents depuis le stockage local
                const previousPercentage = parseFloat(localStorage.getItem('vineProgressPercentage')) || null;
                const previousDate = localStorage.getItem('vineProgressDate') || null;

                //console.log("Pourcentage précédent :", previousPercentage);
                //console.log("Date précédente :", previousDate);

                const progressText = document.querySelector('#vvp-perc-reviewed-metric-display p strong');
                const progressContainer = document.querySelector('#vvp-perc-reviewed-metric-display .animated-progress');
                const metricsBox = document.querySelector('#vvp-vine-activity-metrics-box .a-box-inner');

                //Augmenter dynamiquement la hauteur du bloc des métriques
                metricsBox.style.paddingTop = '10px'; //Ajouter du padding en haut
                metricsBox.style.paddingBottom = '10px'; //Ajouter du padding en bas

                if (progressText) {
                    const currentPercentageText = progressText.textContent.trim();
                    const currentPercentage = parseFloat(currentPercentageText.replace('%', '').replace(',', '.'));

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
                        updateDateTimeElement(progressContainer, dateTimeNow, differenceText, differenceColor);
                    } else if (previousDate) {
                        //Si aucune modification détectée, afficher la date et l'heure de la dernière modification
                        updateDateTimeElement(progressContainer, previousDate);
                    }
                }

                function updateDateTimeElement(containerElement, dateTime, differenceText = '', differenceColor = '') {
                    //Supprimer l'élément de date précédent s'il existe
                    let previousDateTimeElement = document.querySelector('.last-modification');
                    if (previousDateTimeElement) {
                        previousDateTimeElement.remove();
                    }

                    //Créer un nouvel élément de date
                    const dateTimeElement = document.createElement('span');
                    dateTimeElement.className = 'last-modification';
                    //dateTimeElement.style.marginLeft = '10px';
                    dateTimeElement.innerHTML = `Dernière modification constatée le <strong>${dateTime}</strong>`;

                    if (differenceText) {
                        const differenceElement = document.createElement('span');
                        differenceElement.style.color = differenceColor;
                        differenceElement.textContent = ` (${differenceText})`;
                        dateTimeElement.appendChild(differenceElement);
                    }

                    //Insérer le nouvel élément après le conteneur de progression
                    containerElement.parentNode.insertBefore(dateTimeElement, containerElement.nextSibling);
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

                //Extraction des données de la page
                function extractData() {
                    const percentageText = document.querySelector('#vvp-perc-reviewed-metric-display p strong').innerText;
                    const articlesText = document.querySelector('#vvp-num-reviewed-metric-display p strong').innerText;

                    const percentage = parseFloat(percentageText.replace(',', '.').replace('%', '').trim());
                    const evaluatedArticles = parseInt(articlesText, 10);
                    return { percentage, evaluatedArticles };
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
                    const progressBar = targetDiv.querySelector('.animated-progress.progress-green');
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

                    progressBar.insertAdjacentElement('afterend', resultSpan);
                    resultSpan.insertAdjacentElement('afterend', hrElement);
                }

                function centerContentVertically() {
                    const metricsBox = document.querySelector('#vvp-vine-activity-metrics-box .a-box-inner');
                    metricsBox.style.display = 'flex';
                    metricsBox.style.flexDirection = 'column';
                    metricsBox.style.justifyContent = 'center';
                    metricsBox.style.height = '100%';
                }

                function removeGreyText() {
                    const greyTextElement = document.querySelector('p.grey-text');
                    if (greyTextElement) {
                        greyTextElement.remove();
                    }
                }
            }
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

        //Suppression header
        function hideHeader() {
            var styleHeader = document.createElement('style');

            styleHeader.textContent = `
body {
  padding-right: 0px !important;
}

#navbar-main, #nav-main, #skiplink {
  display: none;
}

.amzn-ss-wrap {
  display: none !important;
}
`
            document.head.appendChild(styleHeader);
        }

        //Ajoute les pages en partie haute
        function addPage() {
            //Sélection du contenu HTML du div source
            const sourceElement = document.querySelector('.a-text-center');
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

        //Pour sauvegarder le contenu des commandes, si on est sur la page des commandes
        function saveOrders() {
            if (window.location.href.includes('orders')) {
                //Extraction des données de chaque ligne de produit
                document.querySelectorAll('.vvp-orders-table--row').forEach(row => {
                    let productUrl = row.querySelector('.vvp-orders-table--text-col a');
                    let asin;
                    if (productUrl) {
                        productUrl = productUrl.href;
                        asin = extractASIN(productUrl);
                    } else {
                        return;
                    }
                    const key_asin = "order_" + asin;
                    if (!localStorage.getItem(key_asin)) {
                        const imageUrl = row.querySelector('.vvp-orders-table--image-col img').src;
                        let productName = row.querySelector('.vvp-orders-table--text-col a .a-truncate-full')
                        if (productName) {
                            productName = productName.textContent.trim();
                        } else {
                            productName = "Indispo";
                        }
                        const timestampElement = row.querySelector('[data-order-timestamp]');
                        const timestamp = timestampElement.getAttribute('data-order-timestamp');
                        const orderDate = timestampElement ? new Date(parseInt(timestampElement.getAttribute('data-order-timestamp'))).toLocaleDateString("fr-FR") : null;
                        const etv = row.querySelector('.vvp-orders-table--text-col.vvp-text-align-right').textContent.trim();
                        const orderDetailsUrl = row.querySelector('.vvp-orders-table--action-btn a').href;
                        const orderId = extractOrderId(orderDetailsUrl);

                        //Préparation de l'objet à stocker
                        const productData = {
                            productName,
                            imageUrl,
                            orderDate,
                            timestamp,
                            etv,
                            orderId
                        };
                        //console.log(productData);

                        //Stockage dans localStorage avec l'ASIN comme clé
                        if (localStorage.getItem(key_asin) === null || !isMobile()) {
                            localStorage.setItem(key_asin, JSON.stringify(productData));
                        }
                    }
                });
            }
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
                    console.error('Erreur lors de la copie :', err);
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
                    console.error('Erreur lors de la copie :', err);
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

        //Fonction pour sauvegarder l'avis (doublon avec celle plus haut)
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
            localStorage.setItem(`review_${asin}`, JSON.stringify({ title, review }));
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

        //localStorage.removeItem('enableDateFunction');
        var enableDateFunction = localStorage.getItem('enableDateFunction');
        var enableReviewStatusFunction = localStorage.getItem('enableReviewStatusFunction');
        var enableColorFunction = localStorage.getItem('enableColorFunction');
        var filterEnabled = localStorage.getItem('filterEnabled');
        var profilEnabled = localStorage.getItem('profilEnabled');
        //var footerEnabled = localStorage.getItem('footerEnabled');
        var footerEnabled = 'false';
        var headerEnabled = localStorage.getItem('headerEnabled');
        var pageEnabled = localStorage.getItem('pageEnabled');
        var emailEnabled = localStorage.getItem('emailEnabled');
        var lastUpdateEnabled = localStorage.getItem('lastUpdateEnabled');
        var targetPercentageEnabled = localStorage.getItem('targetPercentageEnabled');
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

        if (enableColorFunction === null) {
            enableColorFunction = 'true';
            localStorage.setItem('enableColorFunction', enableColorFunction);
        }

        if (reviewColor === null) {
            reviewColor = '#0000FF';
            localStorage.setItem('reviewColor', reviewColor);
        }

        if (filterEnabled === null) {
            filterEnabled = 'true';
            localStorage.setItem('filterEnabled', filterEnabled);
        }

        if (profilEnabled === null) {
            profilEnabled = 'true';
            localStorage.setItem('profilEnabled', profilEnabled);
        }

        if (footerEnabled === null) {
            footerEnabled = 'false';
            localStorage.setItem('footerEnabled', footerEnabled);
        }

        if (headerEnabled === null) {
            headerEnabled = 'false';
            localStorage.setItem('headerEnabled', headerEnabled);
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

        if (targetPercentageEnabled === null) {
            targetPercentageEnabled = 'true';
            localStorage.setItem('targetPercentageEnabled', targetPercentageEnabled);
            localStorage.setItem('gestavisTargetPercentage', '90');
            localStorage.setItem('doFireWorks', 'true');
        }

        if (autoSaveEnabled === null) {
            autoSaveEnabled = 'true';
            localStorage.setItem('autoSaveEnabled', autoSaveEnabled);
        }

        if (isMobile()) {
            pageX = "X";
            mobileDesign();
        }

        if (enableDateFunction === 'true') {
            highlightDates();
        }

        if (enableReviewStatusFunction === 'true') {
            highlightReviewStatus();
        }

        if (enableColorFunction === 'true') {
            changeColor();
        }

        if (filterEnabled === 'true') {
            masquerLignesApprouve();
        }

        if (headerEnabled === 'true') {
            hideHeader();
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
            //Les ASIN ne sont pas disponibles sur la page des commandes sur Mobile, donc on ne peut pas sauvegarder les commandes
            if (!isMobile()) {
                saveOrders();
            }
            addMail();
        }

        if (lastUpdateEnabled === 'true') {
            lastUpdate();
        }

        if (targetPercentageEnabled === 'true') {
            targetPercentage();
        }

        if (autoSaveEnabled === 'true') {
            autoSaveReview();
        }
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
                }
                //Ajout multiple de fichiers média (nouveau comportement)
                var inputElement = document.querySelector(
                    'input[data-testid="in-context-ryp__form-field--mediaUploadInputHidden"], #media'
                );
                if (inputElement) {
                    inputElement.setAttribute('multiple', '');

                    //Permet de téléverser séquentiellement les fichiers sélectionnés
                    let isProcessingUpload = false;
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
                            progressDiv.style.bottom = '10px';
                            progressDiv.style.right = '10px';
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
                                    console.error('Erreur de conversion HEIC', err);
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

        function mobileDesign() {
            var mobileCss = document.createElement('style');

            mobileCss.textContent = `
#configPopupRR, #emailConfigPopup {
  width: 350px !important;
  height: 600px;
}

#colorPickerPopup {
  width: 350px !important;
}

/* Taille dynamique pour mobile */
@media (max-width: 600px) {
  #configPopupRR {
    width: 90%; /* Prendre 90% de la largeur de l'écran */
    height: 90%;
    margin: 10px auto; /* Ajout d'un peu de marge autour des popups */
  }
}

@media (max-width: 600px) {
  #colorPickerPopup, #emailConfigPopup {
    width: 90%; /* Prendre 90% de la largeur de l'écran */
    margin: 10px auto; /* Ajout d'un peu de marge autour des popups */
  }
}

/* Fix CSS du 12/05/25 */
.vvp-centered-logo {
  width: auto !important;
}
.vvp-items-button-and-search-container {
  margin-top: 0 !important;
  margin-left: 0 !important;
}

#vvp-header .vvp-header-links-container {
  display: block !important;
}

/* Taille de police différente
.a-ember body {
     font-size : 12px !important;
}*/

/* Taille de police pour le texte gris de la page du compte */
.grey-text {
    font-size: 12px;
}

/* Taille des fonds gris sur le compte */
#vvp-current-status-box {
    height: 200px !important;
}

.vvp-body {
  padding: 0px !important;
}

#vvp-vine-activity-metrics-box {
    height: 320px !important;
}

.a-button-text {
    /* Si nécessaire, ajustez aussi le padding pour .a-button-text */
    padding: 2px; /* Ajustement du padding pour le texte du bouton */
}

/* Modification du bouton du rapport */
.a-button-dropdown {
    width: auto;
    max-width: 300px;
}

.a-button-inner {
    padding: 5px 10px;
}

.a-dropdown-prompt {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* On retire le texte de l'écran compte */
#vvp-gold-status-perks-display * {
    visibility: hidden;
}

.a-column.a-span6.a-span-last #vvp-you-are-awesome-display {
    visibility: hidden;
}

body {
  padding-right: 0px !important;
}

.a-section.vvp-items-button-and-search-container {
  flex-direction: column !important;
}

.vvp-container-right-align {
  margin-top: 10px !important;
  width: 100% !important;
  flex-grow: 1 !important;
}

.a-icon-search {
  display: none;
}

.a-search {
  flex-grow: 1;
}

#vvp-search-text-input {
  width: 100% !important;
}

.a-tabs {
  margin: 0px !important;
}

.a-tabs li a {
  padding: 1rem !important;
}

.nav-mobile.nav-ftr-batmobile {
  display: none;
}

.vvp-tab-set-container
  [data-a-name="vine-items"]
  .a-box-inner
  .vvp-tab-content
  .vvp-items-button-and-search-container {
  margin: 0px !important;
}

#a-page
  > div.a-container.vvp-body
  > div.a-tab-container.vvp-tab-set-container
  > ul {
  margin-bottom: 0px !important;
}

.a-button-primary {
  transition: 0.2s !important;
}

.a-button-primary .a-button-inner {
  background-color: transparent !important;
}

.a-button-primary:hover {
  opacity: 0.85 !important;
}

/* Pagination styles */
.a-pagination {
  display: flex !important;
  justify-content: center;
}

.a-pagination li:first-child,
.a-pagination li:last-child {
  color: transparent !important;
  position: relative;
}

.a-pagination li.a-disabled {
  display: none !important;
}

.a-pagination li:first-child a,
.a-pagination li:last-child a {
  display: flex;
  align-content: center;
  position: relative;
  justify-content: center;
}

.a-pagination li:first-child a:before,
.a-pagination li:last-child a:before {
  position: absolute !important;
  color: white !important;
  font-size: 2rem !important;
  line-height: 4rem;
  height: 100%;
  width: 100%;
}

ul.a-pagination li:first-child a,  /* Cible le premier li de la liste, supposant que c'est Précédent */
li:last-child.a-last a {     /* Cible les li avec classe 'a-last', supposant que c'est Suivant */
    font-size: 0;
}

li:first-child a span.larr,  /* Cible le span larr dans le premier li */
li.a-last a span.larr {      /* Cible le span larr dans les li a-last */
    font-size: 16px;
    visibility: visible;
}

.a-pagination li {
  width: 40px !important;
  height: 40px !important;
}
.a-pagination li a {
  padding: 0px !important;
  margin: 0px !important;
  height: 100%;
  line-height: 40px !important;
}

.vvp-details-btn {
  padding: 0.25rem 0 !important;
  margin: 0.25rem 0rem !important;
}

.vvp-details-btn .a-button-text {
  padding: 0.5px 0.25px !important;
}

/* PRODUCT AND REVIEW PAGES */
#vvp-product-details-img-container,
#vvp-product-details-img-container img {
  height: 75px;
}

#vvp-browse-nodes-container,
#vvp-browse-nodes-container .parent-node,
#vvp-browse-nodes-container .child-node {
  width: unset !important;
}

.vvp-reviews-table .vvp-reviews-table--row,
.vvp-orders-table .vvp-orders-table--row {
  display: flex;
  flex-wrap: wrap;
}

.vvp-reviews-table tbody,
.vvp-orders-table tbody {
  display: flex !important;
  flex-wrap: wrap;
}

.vvp-reviews-table--heading-row,
.vvp-orders-table--heading-row {
  display: none !important;
}

.vvp-reviews-table td,
.vvp-orders-table td {
  padding-top: 0px !important;
  padding-bottom: 0px !important;
}

.vvp-reviews-table td.vvp-reviews-table--image-col,
.vvp-orders-table td.vvp-orders-table--image-col {
  padding-top: 10px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.vvp-reviews-table td.vvp-reviews-table--image-col img,
.vvp-orders-table td.vvp-orders-table--image-col img {
  height: 75px;
}

.vvp-reviews-table--actions-col,
.vvp-orders-table--actions-col {
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
}

#vvp-items-grid, #tab-unavailable, #tab-hidden, #tab-favourite {
  grid-template-columns: repeat(
    auto-fill,
    minmax(var(--grid-column-width), auto)
  ) !important;
}

#vvp-header .vvp-header-links-container {
  display: block !important;
}
		`;
            document.head.appendChild(mobileCss);
        }

        window.addEventListener('load', function () {
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
