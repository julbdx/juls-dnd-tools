import { QuickAttackApp } from './quick-attack-app.js';
import { QuickDamageApp } from './quick-damage-app.js';
import { BuyServiceApp } from "./buy-service-app.js";
import { JulMerchantSheet } from './merchant-sheet.js';
import { JulCombatSystem } from './combat-system.js';
import { RestsApp } from "./rests-app.js";

/*
Midi QOL :
utils.js
export function playerForActor(actor) {
	return game.users?.activeGM;
   ...
*/

const JULS_MODULE_NAME = 'juls-dnd-tools';
const socketName = 'module.juls-dnd-tools';

const julsCloseImagePopout = () => {
   const imagePopout = document.querySelector(".image-popout a.close");
   if (imagePopout) {
      imagePopout.click();
      return;
   }

   // Trouver toutes les fenêtres popout ouvertes
   const openPopouts = Object.values(ui.windows).filter(w => w instanceof ImagePopout);

   // Fermer toutes les fenêtres popout sauf la dernière ouverte
   openPopouts.forEach(popout => {
      popout.close(); // Ferme la fenêtre popout
   });

   const journalPopout = document.querySelector(".journal-sheet a.close");
   if (journalPopout) {
      journalPopout.click();
      return;
   }
};


/**
 * Renvoi vrai si l'acteur a accès au positionnement de 
 * dés manuels
 */
function isTrustedManualRollForActor(actor)
{
   if (actor)
      return actor.hasPlayerOwner || 
               actor.collections.items.some(item => item.name === "Jets manuels" || 
                  item.name === "Manual rolls"); // Remplacer par l'identifiant correct si nécessaire.

   return false;
}

Hooks.once("init", () => {

   CONFIG.TextEditor.enrichers.push({
      pattern: /@buy\[(.*?)\](?:\{(.*?)\})?(?:\((.*?)\))?/gi,
      enricher: async (match, options) => {
         const amount = match[1];  // La somme d'argent, ex: "2gp 4sp"
         const label = match[2] || amount;  // Label à afficher
         const transactionName = match[3] || label;  // Nom de la transaction
         
         let amountStr = amount;
         // Pour chaque devise, on remplace le symbole par le nom complet
         for (const [key, value] of Object.entries(CONFIG.DND5E.currencies))
         {
            amountStr = amountStr.replace(key, ' <i class="currency ' + key + '" data-tooltip="' + value.label + '"></i>');            
         }

         // Créer un élément HTML interactif
         const a = document.createElement('span');
         a.classList.add('award-block');
         a.classList.add('dnd5e2');
         a.innerHTML = '<span class="award-entry">' + amountStr + '</span> ' + 
                        '<a class="buy-link" data-amount="' + amount + '" data-transaction-name="' + 
                        // Echappement des "
                        transactionName.replace(/"/g, '&quot;') +                        
                        '">' + 
                        '<i class="fa-solid fa-shopping-cart"></i> Acheter</i></a>';
         return a;
      },
      priority: 0,  // Optionnel, priorité d'exécution
      name: 'buy-enricher'  // Optionnel, nom de l'enricher
   },
   );

   // Enregistrer un nouveau paramètre de configuration pour chaque joueur
   game.settings.register("juls-dnd-tools", "tvMode", {
      name: "Mode TV", // Le nom visible du paramètre
      hint: "Choisissez Horizontal si l'écran est positionné sur la table des joueurs, ou vertical si normal", // Un texte explicatif
      scope: "client", // Ce paramètre est propre à chaque joueur
      config: true, // Afficher dans l'interface de configuration
      type: String, // Le type de valeur (chaîne de caractères dans ce cas)
      choices: {
          "vertical": "Mode TV Vertical",
          "horizontal": "Mode TV Horizontal"
      }, // Les choix possibles
      default: "vertical", // Valeur par défaut
      onChange: value => {
          console.log(`Mode TV changé pour : ${value}`);
          // Tu peux ajouter ici une action lorsque le mode change
      }
  });

  class CustomJulD20Roll extends CONFIG.Dice.D20Roll {
      constructor(formula, data, options) {
         super(formula, data, options);
         if ( !this.options.configured ) this.configureModifiers();
      }

      /**
         * Construct and perform a roll through the standard workflow.
         * @param {BasicRollProcessConfiguration} [config={}]   Configuration for the rolls.
         * @param {BasicRollDialogConfiguration} [dialog={}]    Configuration for roll prompt.
         * @param {BasicRollMessageConfiguration} [message={}]  Configuration for message creation.
         * @returns {BasicRoll[]}
         */
      static async build(config={}, dialog={}, message={}) {
         // Lancé manuel ?
         console.log(config);
         console.log(dialog);
         console.log(message);
         const actor = config.subject;
         if (isTrustedManualRollForActor(actor))
         {
            const saveDC = config.target ?? '?';
            const abilityLabel = CONFIG.DND5E.abilities[config.ability].label;
 
            const content = `
            <form>
               <p>Jet de sauvegarde : <strong>${abilityLabel}</strong></p>
               ${saveDC ? `<p>DD : <strong>${saveDC}</strong></p>` : ""}
            </form>
            `;

            const rollResult = await new Promise((resolve) => {
               const d = new Dialog({
                  title: `Jet manuel pour ${actor.name}`,
                  content,
                  buttons: {
                     success: {
                        label: "✅ Succès",
                        callback: () => resolve(20)
                      },

                      failure: {
                        label: "❌ Échec",
                        callback: () => resolve(1)
                      },

                      normal: {
                        label: "🎲 Jet standard",
                        callback: () => resolve(null)
                      },
                  }
               });
               d.render(true);
               });
            
            if (rollResult)
            {               
               dialog.configure = false;
               const rolls = await this.buildConfigure(config, dialog, message);
               await this.buildEvaluate(rolls, config, message);

               // INTERCEPTION DES ÉCHECS ICI
               for (let roll of rolls) {
                  for (let term of roll.terms) {
                     if (term instanceof Die) {
                        for (let result of term.results) {
                           result.result = rollResult;
                           result.active = true;
                           result.hidden = true;
                        }
                     }
                  }

                  // Important : mettre à jour la valeur du jet
                  
                  roll._total = roll._evaluateTotal();                  
               }  
               
               await this.buildPost(rolls, config, message);

               return rolls;
            }
         }         

         return await super.build(config, dialog, message);
      }
   }

   // Remplacement des dés   
   CONFIG.Dice.D20Roll = CustomJulD20Roll;
   CONFIG.Dice.rolls.push(CustomJulD20Roll);
   console.log("Jul D20 Roll configuré !");
   // Fiche de marchand
   Actors.registerSheet("dnd5e", JulMerchantSheet, { types: ["npc"], makeDefault: false });
});

Hooks.once("ready", () => {
   // Si le joueur est le MJ   
   if (game.user.isGM === true) {
      document.addEventListener("keypress", (e) => {
         if (
            e.key == '²' &&
            e.target.tagName.toUpperCase() != "INPUT" &&
            e.target.tagName.toUpperCase() != "TEXTAREA"
         ) {            
            game.socket.emit(socketName);
         }
      });
   }
   else
   {
      // Si le joueur n'est pas MJ
      // On grise certaines parties de la fiche de personnage
      const linkElement = document.createElement("link");
      linkElement.rel = "stylesheet";
      linkElement.href = "modules/juls-dnd-tools/assets/players.css"; // Chemin vers le fichier CSS
      document.head.appendChild(linkElement);

      const tvMode = game.settings.get("juls-dnd-tools", "tvMode");
      if (tvMode == 'horizontal')
      {
         const linkElement = document.createElement("link");
         linkElement.rel = "stylesheet";
         linkElement.href = "modules/juls-dnd-tools/assets/horizontal.css"; // Chemin vers le fichier CSS
         document.head.appendChild(linkElement);
      }

      // On parcours l'interface à la recherche des classes "body .illandril-grid-labels--grid--container"
      // pour leur rajouter la class "story-sheet" pour qu'ils ne soit pas masqués par monk-display
      let elements = document.querySelectorAll("body .illandril-grid-labels--grid--container");
      elements.forEach(element => {
         element.classList.add("story-sheet");
      });
   }
   
   game.socket.on(socketName, (data) => { 
      switch (data ?? 'close')
      {
         case 'close':
            julsCloseImagePopout();
            break;
      }
   });

   // Publication de fonction pour les macros
   let m = game.modules.get("juls-dnd-tools");
   m.julQuickAttack = julQuickAttack;
   m.julQuickDamage = julQuickDamage;
   m.julQuickConcentration = julQuickConcentration;
   m.julRests = julRests;
   m.julCountdown = julCountdown;
   m.fakeDice = fakeDice;
   m.julPlayMusic = stopAndPlayMusic;
   m.julCombatSystem = new JulCombatSystem();
});
 

function addLinksToImages(images) {
   images.each(function() {
       const imgObj = $(this);
       const imgSrc = imgObj.attr('src');       
       
       // Vérifie si l'attribut "data-show-player" existe
      if (!imgObj.attr('data-show-player')) {
         // Si l'attribut n'existe pas, le définir à 1
         imgObj.attr('data-show-player', '1');
         
         imgObj.on('contextmenu', function(e) {
            e.preventDefault();

            let startTimer = 500;
            
            let music = '';
            let parts = imgObj.attr("alt")?.split(";") ?? [];
            if (parts.length > 3)
               music = parts[3].trim();               

            // Envoi la musique
            if (music)
            {
               let playlist = game.playlists.getName("Thèmes");
               if (playlist) {
                  // Rechercher la première piste dont le nom commence par la valeur de music
                  let track = playlist.sounds.find(sound => sound.name.startsWith(music));
                  if (track)         
                     playlist.playSound(track);                     
               }
            }

            setTimeout(() => {
               let imgPopout = new ImagePopout(imgSrc, {
                  title: imgObj.attr("alt") ?? null,                  
                  shareable: true,
              });
              imgPopout.shareImage();
            }, startTimer);
        });
       }       
   });
}

Hooks.on('renderJournalTextPageSheet', (app, html, data) => {
   html.on('click', '.buy-link', async (event) => {
     event.preventDefault();
     const amount = event.currentTarget.getAttribute('data-amount');
     const transactionName = event.currentTarget.getAttribute('data-transaction-name');
     await handleMoneyTransaction(amount, transactionName);
   });

   // Sur tous les liens de classe "content-link" ayant une propriété data-type="Scene", on pose un écouteur d'événement
   html.on('click', '.content-link[data-type="Scene"]', async (event) => {
      event.preventDefault();
      const sceneId = event.currentTarget.getAttribute('data-id');
      const scene = game.scenes.get(sceneId);
      if (scene) {
         scene.activate();
      }

      event.stopPropagation();
   });   
 });

Hooks.on('renderJournalSheet', (app, html) => {
   if( game.user.isGM ) {      
      const observer = new MutationObserver((mutations) => {
         mutations.forEach((mutation) => {
             if (mutation.type === 'childList') {
                 const images = $(mutation.target).find('img');
                 addLinksToImages(images);                 
             }
         });
     });
 
     const config = { childList: true, subtree: true };
     observer.observe(html[0], config);
   }
});

// Obtenir l'orientation de l'image
async function getImageOrientation(sourceUrl) {
   return new Promise((resolve, reject) => {
       const img = new Image();

       img.onload = function() {
           const width = img.width;
           const height = img.height;

           let orientation;
           if (width > height) {
               orientation = 'landscape';  // Paysage
           } else
               orientation = 'portrait';   // Portrait

           resolve(orientation);
       };

       img.onerror = function() {
           reject(new Error('Image could not be loaded.'));
       };

       img.src = sourceUrl;
   });
}

Hooks.on('renderImagePopout', async (app, html, data) => {

   if( !game.user.isGM ) {      

      // Trouver toutes les fenêtres popout ouvertes
      const openPopouts = Object.values(ui.windows).filter(w => w instanceof ImagePopout);

      // Fermer toutes les fenêtres popout sauf la dernière ouverte
      openPopouts.forEach(popout => {
         if (popout !== app) { // Vérifie si ce n'est pas la fenêtre courante
            popout.close(); // Ferme la fenêtre popout
         }
      });

      let render = '<div class="window-content dtjul-photo-window">';
      
      // Tableau contenant les textes
      const tvMode = game.settings.get("juls-dnd-tools", "tvMode");
      let frames = ["full"];
      if (tvMode == 'horizontal')
         frames = ["top", "bottom", "side"];

      let orientation = await getImageOrientation(data.image);

      let duree = 10000;
      let startTimer = 2000;
      let title = '';
      let subtitle = '';

      let parts = data.title?.split(";") ?? [];
      if (parts.length > 1)
      {         
         title = parts[1].trim();
         if (parts.length > 2 && parts[1].trim() != '')
         {
            subtitle = '— ' + parts[1].trim() + ' —';
            title = parts[2].trim();

            if (parts.length > 4)
               duree = parts[4].trim() * 1000;
         }         
      }      

      // Boucle forEach pour ajouter chaque texte à la variable render
      if (!title && !subtitle)
      {
         frames.forEach(frame => {         
            render += `<div class="dtjul-photo-box ${frame} ${orientation}">
               <img src="${data.image}" alt="Image" class="image">
            </div>`;
         });
      }
      else
      {
         frames.forEach(frame => {         
            render += `<div class="dtjul-photo-box ${frame} ${orientation}">
               <img src="${data.image}" alt="Image" class="image">
               <div class="content">
                  <img src="/modules/juls-dnd-tools/assets/trait2.png" alt="Trait Séparateur" class="dtjul-separator">
                  <h1 class="dtjul-subtitle">${subtitle}</h1>
                  <h2 class="dtjul-title">${title}</h2>
                  <img src="/modules/juls-dnd-tools/assets/trait2.png" alt="Trait Séparateur" class="dtjul-separator">
               </div>        
            </div>`;
         });
      }
   
      render += "</div>";

      html.html(render);
      html.addClass('dtjul-image-popout-app');
      html.removeClass('app window window-app dark');      

      // Once the box has fully appeared, reveal the text and separator
      setTimeout(() => {
         const titles = document.querySelectorAll('.dtjul-title');
         const subtitles = document.querySelectorAll('.dtjul-subtitle');
         const separators = document.querySelectorAll('.dtjul-separator');
   
         separators.forEach(separator => {
               separator.style.opacity = '1';
               separator.style.transform = 'scaleX(1)';    
         });

         setTimeout(() => {
               subtitles.forEach(title => {
                  title.style.opacity = '1';
                  title.style.transform = 'scale(1)';    
               });
         }, 500); // Delay to match the appearance of the text

         setTimeout(() => {
               titles.forEach(title => {
                  title.style.opacity = '1';
                  title.style.transform = 'scale(1)';    
               });
         }, 1500); // Delay to match the appearance of the text

         setTimeout(() => {
               setTimeout(() => {
                  separators.forEach(separator => {
                     separator.style.opacity = '0';
                     separator.style.transform = 'scaleX(0)';    
                  });
               }, 2000); // Delay to match the appearance of the text

               setTimeout(() => {
                  subtitles.forEach(title => {
                     title.style.opacity = '0';                
                  });
               }, 1500); // Delay to match the appearance of the text

               setTimeout(() => {
                  titles.forEach(title => {
                     title.style.opacity = '0';                
                  });
               }, 1000); // Delay to match the appearance of the text
               
         }, duree); // Delay to match the appearance of the text
      }, startTimer); // Delay to match the appearance of the text
   }
});


/**
 * Fonction pour macro qui déclenche une attaque rapide
 * 
 */
async function julQuickAttack(attackerToken, targetToken)
{
   // Si pas d'acteur, alors on prend l'acteur dont c'est le tour de combat
   if (!attackerToken)
   {
      const c = game.combat?.combatant?.token;
      // On cherche le token de l'acteur dont c'est le tour
      if (c)
         attackerToken = canvas.tokens.get(c._id);
   }

   // Si toujours pas d'acteur, on prend le premier acteur sélectionné
   if (!attackerToken)
      attackerToken = canvas.tokens.controlled[0];

   // Si toujours pas d'acteur, on arrête avec un message d'erreur
   if (!attackerToken)
   {
      ui.notifications.error("Aucun attaquant n'est sélectionné !");
      return;
   }

   // Détermination de la cible
   if (!targetToken)
      targetToken = game.user.targets.values().next().value;

   // Si pas de cible, alors on prend le premier token contrôlé
   if (!targetToken)
      targetToken = canvas.tokens.controlled[0];
   
   // Si toujours pas de cible, on arrête avec un message d'erreur
   if (!targetToken)
   {
      ui.notifications.error("Aucune cible n'est sélectionnée !");
      return;
   }

   if (targetToken.id === attackerToken.id)
   {
      ui.notifications.error("La cible et l'attaquant ne peuvent pas être la même personne !");
      return;
   }

   // Créer et afficher l'application
   const app = new QuickAttackApp(attackerToken, targetToken);
   app.render(true);  // Afficher l'application
}


/**
 * Fonction qui déclenche un jet natural 20 et l'affiche avec Dice So Nice
 * aux joueurs
 * 
 * @param {number} value - Valeur du jet, par défaut 20
 */
async function fakeDice(result = 20)
{
   // Force un d20 à faire un 20 naturel, avec Dice So Nice
      const roll = await new Roll('1d20').evaluate();

      // On modifie directement le résultat pour qu'il soit un 20
      roll.terms[0].results[0].result = result;
      roll.terms[0].results[0].active = true;
      roll._total = result;
      roll._evaluated = true;

      // Affiche le dé avec Dice So Nice
      await game.dice3d?.showForRoll(roll, game.user, true);
}

/**
 * Fonction qui affiche un chrono !
 * @param {number} seconds - Nombre de secondes pour le compte à rebours
 * @param {string} name - Nom du compte à rebours (optionnel)
 * @param {string} color - Couleur du texte du compte à rebours (optionnel, par défaut 'red')
 */
async function julCountdown(seconds, name = 'default', color = 'red')
{
   // On mémorise la date départ ici
   const endDate = Date.now() + seconds * 1000;

   // On vérifie s'il existe déjà l'overlay de compte à rebours
   let countdownOverlay = document.querySelector('#djul-countdown-overlay');

   // Si l'overlay n'existe pas, on le crée
   if (!countdownOverlay) {
      countdownOverlay = document.createElement('div');
      countdownOverlay.id = 'djul-countdown-overlay';
      document.body.appendChild(countdownOverlay);
   }

   // Vérifier s'il existe déjà un compte à rebours du même nom, si oui, on le supprime
   const countdownId = "countdown-" + name;
   let countdownDiv = document.getElementById(countdownId);
   if (!countdownDiv)
   {
      // Créer un élément div pour afficher le compte à rebours
      countdownDiv = document.createElement("div");
      countdownDiv.id = countdownId;
      countdownDiv.classList.add("djul-countdown");      
      countdownOverlay.appendChild(countdownDiv);
      countdownDiv.textContent = '';      
   }
   else
      countdownDiv.style.animation = 'none'; // Pas d'animation par défaut   
   countdownDiv.style = `color: ${color};}`;

   // Boucle du compte à rebours
   let resetAutoDetect = null;
   while (seconds > 0) 
   {
      // On prend le texte du compte à rebours
      const countdownText = countdownDiv.innerHTML;
      // Si le texte du compte à rebours est différent de resetAutoDetect, alors on a terminé : le compte à rebours a été réinitialisé
      if (resetAutoDetect != null && countdownText != resetAutoDetect)
         return;
      
      // Dans seconds, on calcul le nombre de secondes qui nous sépare de endDate
      seconds = Math.max(0, Math.floor((endDate - Date.now()) / 1000));

      // Affichage en minute > 60 secondes
      let label = seconds;
      if (seconds > 60)
      {
         let minutes = Math.floor(seconds / 60);
         let secondsLeft = seconds  - minutes * 60;
         if (secondsLeft < 10) secondsLeft = "0" + secondsLeft;
         label = `${minutes}:${secondsLeft}`;
      }

      label = '<div class="djul-label-count">' + name + '</div>' + label;

      countdownDiv.innerHTML = label;
      resetAutoDetect = label;

       // Activer l'animation de pulsation pour les 10 dernières secondes
       if (seconds <= 10) {
           countdownDiv.style.animation = "pulse 0.5s infinite alternate";
       }

       await new Promise(resolve => setTimeout(resolve, 1000));
   }

   // Supprimer l'affichage et le style après expiration du temps
   countdownDiv.style.animation = "blink 1s infinite alternate";
   await new Promise(resolve => setTimeout(resolve, 3000));

   // On prend le texte du compte à rebours
   const countdownText = countdownDiv.textContent;
   // Si le texte du compte à rebours est différent de resetAutoDetect, alors on a terminé : le compte à rebours a été réinitialisé
   if (resetAutoDetect != null && countdownText != resetAutoDetect)
      return;

   countdownDiv.remove();
   
   // On compte le nombre de compte à rebours actifs
   const activeCountdowns = document.querySelectorAll('.djul-countdown');
   if (activeCountdowns.length === 0) {
      // Si plus de compte à rebours actifs, on supprime l'overlay
      countdownOverlay.remove();
   }
}

/**
 * Restaure la musique d'origine
 * 
 * @param {*} newPlaylistId nouvelle playlist  à lire
 * @param {*} duration durée des transitions
 */
async function stopAndPlayMusic(newPlaylistId, duration = 10)
{
   let musicsPlaying = []; 

   // On récupère la playlist à jouer
   let selectedPlaylist = game.playlists.find(p => p.id === newPlaylistId);

   // on arrête toutes les musiques
   for (const playlist of game.playlists.filter(playlist => playlist.playing))
   {
      // On ne garde en mémoire que les playlists non soundboard ou
      // si le son actuel de la playlist est pas en mode repeat
      let playingSound = playlist.sounds.find(s => s.playing);
      if (playingSound && (playlist.mode !== CONST.PLAYLIST_MODES.SOUNDBOARD || playingSound.repeat))
      {
            musicsPlaying.push(playingSound);
            await playlist.update({ fade: duration * 1000 });
            //await playlist.stopAll();
            setTimeout(() => {
               playlist.update({ fade: 100 });
            }, duration * 1000);            
      }
   }

   for (const playlist of game.playlists.filter(playlist => playlist.playing))
      await playlist.stopAll();

   // on lance la playlist
   if (selectedPlaylist)
   {
      await selectedPlaylist.update({ fade: duration * 1000 });      
      await selectedPlaylist.playAll();
   }
   

}

/**
 * Fonction pour démarrer l'application de repos
 */
function julRests()
{
   // Créer et afficher l'application
   const app = new RestsApp();
   app.render(true);  // Afficher l'application
}

/**
 * Fonction pour macro qui déclenche un dégât rapide
 * 
 * @param {} target 
 */
async function julQuickDamage(targetsTokens, defaultDamage = 'force', damage = 0)
{
   // Détermination de la cible
   if (!targetsTokens || targetsTokens.length == 0)
   {
      targetsTokens = [];
      // On met dans targetsToken tous les tokens targetés
      game.user.targets.forEach(target => {
         targetsTokens.push(target);
      });            
   }

   // Si pas de cible, alors on prend le premier token contrôlé
   if (!targetsTokens || targetsTokens.length == 0)
      targetsTokens = canvas.tokens.controlled;
   
   // Si toujours pas de cible, on arrête avec un message d'erreur
   if (!targetsTokens || targetsTokens.length == 0)
   {
      ui.notifications.error("Aucune cible n'est sélectionnée !");
      return;
   }

   if (!damage || damage === 0)
   {
      // Créer et afficher l'application
      const app = new QuickDamageApp(targetsTokens, defaultDamage);
      app.render(true);  // Afficher l'application
   }
   else
   {
      // Application des dégâts ici !
      // On fait un résumé des dégâts dans une chatcard diffusée par le jeton
      for (let t = 0; t < targetsTokens.length; t++) {
          const token = targetsTokens[t];

          // 2. Récupérer les cartes de chat de dommages récentes (moins de 30 secondes)
         const now = Date.now();
         const chatMessages = game.messages.contents.filter(msg => {
            const isDamageCard = msg.flags["jul-damage-macro"]?.type === "damage-card";
            const isRecent = (now - msg.timestamp) < 15000; // 15 secondes
            
            const isToken = token.id === msg.flags["jul-damage-macro"]?.tokenId;
            return isDamageCard && isRecent && isToken;
         });

         // 3. Calculer le total des dommages
         let oldDamage = 0;
         let totalDamage = damage
         let previousCard = null;
         if (chatMessages.length > 0) {
            previousCard = chatMessages[chatMessages.length - 1];
            const previousDamage = previousCard.flags["jul-damage-macro"]?.totalDamage || 0;
            totalDamage += previousDamage;
            oldDamage += previousDamage;
         }

         // 4. Préparer le contenu de la carte
         const content = (totalDamage > 0) ? 
            `<div>
               <h3>Dommages</h3>
               <p>${totalDamage} points de dégâts infligés.</p>
            </div>` : `<div>
               <h3>Soins</h3>
               <p>${totalDamage*-1} PV regagnés.</p>
            </div>`;

         const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ token: token.document }),
            content,
            flags: {
               "jul-damage-macro": {
                     type: "damage-card",
                     tokenId: token.id,
                     totalDamage: totalDamage
               }
            }
         };

         // 5. Supprimer la carte précédente si elle existe
         if (previousCard) {
            await previousCard.delete();
         }

         // 6. Créer une nouvelle carte
         await ChatMessage.create(chatData);

         const oldHp = token.actor.system.attributes.hp.value;
        
         await token.actor.applyDamage( [ { value: -oldDamage, } ]);
         await token.actor.applyDamage( [ { value: totalDamage, } ]);
         //await token.actor.applyDamage( [ { value: damage, } ]);
         // Ping Combatant
         canvas.ping(token.document.object.center);
         
         // Si après, la cible est morte (pv <= 0), on lui met l'état "mort" si ce n'est pas un PJ               
         if (token.actor.system.attributes.hp.value <= 0)
         {
            if (!token.actor.hasPlayerOwner) 
            {
               // Le personnage est vaincu !
               // Dans le combat, on le marque comme vaincu et invisible
               if (game.combat)
               {
                     const c = game.combat.getCombatantByToken(token.id);
                     if (c)
                     {
                        // On met à jour le statut defeated et hidden du combatant
                        await c.update({ defeated: true, hidden: true });                           
                     }
               }
               console.log(token.actor.effects);
               
               // AJoute l'effet mort au token s'il ne l'a pas déjà
               if (!token.actor.effects.find(eff => eff.statuses.has("incapacitated"))) 
                  await token.actor.toggleStatusEffect("incapacitated", { active: true, overlay: true});
               else if (!token.actor.effects.find(eff => eff.statuses.has("dead"))) 
                  await token.actor.toggleStatusEffect("dead", { active: true, overlay: true});

               // On affiche plus les barres de vie
               token.document.update({ "displayBars": 0, displayName: 30 });

               // Ping Combatant
               canvas.ping(token.document.object.center);
            }
            else
            {
               if (!token.actor.effects.find(eff => eff.statuses.has("prone"))) await token.actor.toggleStatusEffect("prone");
               if (!token.actor.effects.find(eff => eff.statuses.has("unconscious"))) await token.actor.toggleStatusEffect("unconscious");
            }
         } 
         else
         {
            if (token.actor.effects.find(eff => eff.statuses.has("prone"))) await token.actor.toggleStatusEffect("prone");
            if (token.actor.effects.find(eff => eff.statuses.has("unconscious"))) await token.actor.toggleStatusEffect("unconscious");
            if (token.actor.effects.find(eff => eff.statuses.has("dead"))) {
               await token.actor.toggleStatusEffect("dead");
               const c = game.combat.getCombatantByToken(token.id);
               if (c)   // On met à jour le statut defeated et hidden du combatant
                  await c.update({ defeated: false, hidden: false });                           
            }
         }
      };
   }
}

/**
 * Fonction pour macro qui déclenche les jets de concentration
 * 
 * @param {} target 
 */
async function julQuickConcentration(targetsTokens)
{
   // Détermination de la cible
   if (!targetsTokens || targetsTokens.length == 0)
   {
      targetsTokens = [];
      // On met dans targetsToken tous les tokens targetés
      game.user.targets.forEach(target => {
         targetsTokens.push(target);
      });            
   }

   // Si pas de cible, alors on prend le premier token contrôlé
   if (!targetsTokens || targetsTokens.length == 0)
      targetsTokens = canvas.tokens.controlled;
   
   // Si toujours pas de cible, on arrête avec un message d'erreur
   if (!targetsTokens || targetsTokens.length == 0)
   {
      ui.notifications.error("Aucune cible n'est sélectionnée !");
      return;
   }

   // Application des dégâts ici !
   // On fait un résumé des dégâts dans une chatcard diffusée par le jeton
   for (let t = 0; t < targetsTokens.length; t++) 
   {
      const token = targetsTokens[t];

         // 2. Récupérer les cartes de chat de dommages récentes (moins de 30 secondes)
      const now = Date.now();
      const chatMessages = game.messages.contents.filter(msg => {
         const isDamageCard = msg.flags["jul-damage-macro"]?.type === "damage-card";
         const isRecent = (now - msg.timestamp) < 120000; // 2 minutes
         const isToken = token.id === msg.flags["jul-damage-macro"]?.tokenId;
         return isDamageCard && isRecent && isToken;
      });

      // 3. Calculer le total des dommages
      let totalDamage = 0;
      if (chatMessages.length > 0) {
         let previousCard = chatMessages[chatMessages.length - 1];
         const previousDamage = previousCard.flags["jul-damage-macro"]?.totalDamage || 0;
         totalDamage += previousDamage;
      }

      // On lance les jets de concentration au besoin
      if (totalDamage > 0 && token.actor.statuses.has("concentrating"))
      {
         let chatContent = "";
         let dd = 10;
         if (totalDamage / 2.0 > 10)
            dd = Math.ceil(totalDamage / 2.0);
         const r = await token.actor.rollConcentration({ targetValue: dd, });
         const score = r.total;
         if (score < dd)
         {
            // failed ! 
            // on retire toutes les concentrations du token
            let concentrationEffects = token.actor.effects.filter(eff => eff.name.toLowerCase().includes("concentr"));

            chatContent += `✖ Concentration : ${score}/${dd} : raté !`;                            

            for (let effect of concentrationEffects) {
                  await effect.delete();
            }
         }
         else
         {
            chatContent += `✔ Concentration : ${score}/${dd} : réussi !`;
         }

         // On envoie le message
         let chatData = {
            user: game.user._id,
            speaker: ChatMessage.getSpeaker({ token: token.document }),
            content: chatContent,        
         };

         ChatMessage.create(chatData);   
      }
   }
}

async function handleMoneyTransaction(amount, transactionName) {
   // On lance l'application d'achat de service
   const app = new BuyServiceApp(amount, transactionName);
   app.render(true);  // Afficher l'application
} 
