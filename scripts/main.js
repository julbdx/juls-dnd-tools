import constants from "../Constants.js";
import { registerSettings } from "./settings.js";

/*
Midi QOL :
utils.js
export function playerForActor(actor) {
	return game.users?.activeGM;
   ...
*/

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
      return actor.collections.items.some(item => item.name === "Jets manuels" || item.name === "Manual rolls"); // Remplacer par l'identifiant correct si nécessaire.

   return false;
}

Hooks.once("init", () => {

   class CustomJulD20Roll extends CONFIG.Dice.D20Roll {
      constructor(formula, data, options) {
         super(formula, data, options);
         if ( !this.options.configured ) this.configureModifiers();
       }

      /**
         * Create a DamageRoll from a standard Roll instance.
         * @param {Roll} roll
         * @returns {DamageRoll}
         */
      static fromRoll(roll) {
         const newRoll = new this(roll.formula, roll.data, roll.options);
         Object.assign(newRoll, roll);
         return newRoll;
      }

       // Hit dialog
       manualRollDialog(title) {
         let targets = Array.from(game.user.targets);
         let targetDetails = targets.map(target => {
            let name = target.name;
            let ac = target.actor.system.attributes.ac.value; // Cela dépend de votre système de jeu
            return `<li>${name} — CA: ${ac}</li>`;
         });

         let targetString = 
            targetDetails.length > 0 ? "<p><strong>Cibles : </strong><ul>" + targetDetails.join(", ") + "</ul></p>" : "";

         return new Promise((resolve, reject) => {
         let d = new Dialog({
            title: title,
            content: targetString + 
               `<p class="form-group">
                  <label><strong>Valeur manuelle :</strong></label>
                  <input type="text" name="manual" class="autofocus" value="">
               </p>
               <p><strong>Choisissez le résultat du jet :</strong></p>`, 
            buttons: {
               critFail: {
               icon: '<i class="fas fa-times-circle"></i>',
               label: "Échec&nbsp;crit.",
               callback: () => resolve("critFail")
               },
               fail: {
                  icon: '<i class="fas fa-times-circle"></i>',
                  label: "Échec",
                  callback: () => resolve("fail")
               },                              
               success: {
                  icon: '<i class="fas fa-check-circle"></i>',
                  label: "Réussite",
                  callback: () => resolve("success")
               },
               critSuccess: {
                  icon: '<i class="fas fa-crown"></i>',
                  label: "Réussite&nbsp;crit.",
                  callback: () => resolve("critSuccess")
               },
               standardRoll: {
                  icon: '<i class="fas fa-dice"></i>',
                  label: "Jet&nbsp;standard",
                  callback: () => resolve("std")
               },
               manualRoll: {
                  icon: '<i class="fas fa-edit"></i>',
                  label: "Manuelle",
                  callback: (html) => resolve(html.find(`[name=manual]`).val())
               }             
            },
            default: "success",
            render: html => {
               // Positionne le focus sur les dégâts de force
               // Utilise setTimeout pour retarder le focus
               setTimeout(() => {
                 html.find(".autofocus").focus();
                 }, 50);
            },
            close: html => resolve("")
         });
         d.render(true);
         });
      }

       /**
         * Create a Dialog prompt used to configure evaluation of an existing D20Roll instance.
         * @param {object} data                     Dialog configuration data
         * @param {string} [data.title]             The title of the shown dialog window
         * @param {number} [data.defaultRollMode]   The roll mode that the roll mode select element should default to
         * @param {number} [data.defaultAction]     The button marked as default
         * @param {boolean} [data.chooseModifier]   Choose which ability modifier should be applied to the roll?
         * @param {string} [data.defaultAbility]    For tool rolls, the default ability modifier applied to the roll
         * @param {string} [data.template]          A custom path to an HTML template to use instead of the default
         * @param {object} options                  Additional Dialog customization options
         * @returns {Promise<D20Roll|null>}         A resulting D20Roll object constructed with the dialog, or null if the
         *                                          dialog was closed
         */
      async configureDialog(obj={}, options={}) {
         if (isTrustedManualRollForActor(await fromUuid(this.data.actorUuid)))
         {            
            const r = await this.manualRollDialog(obj['title']);

            switch (r)
            {        
               case "critFail":
                  this.terms = [new NumericTerm({number: 1})];
                  break;
               case "fail":
                  this.terms = [new NumericTerm({number: 2})];
                  break;
               case "success":
                  this.terms = [new NumericTerm({number: 19}), new OperatorTerm({operator: "+"}), new NumericTerm({number: 21})];
                  break;
               case "critSuccess":
                  this.terms = [new NumericTerm({number: 20})];
                  break;
               case "std":
                  return await super.configureDialog(obj, options);
                  break;
               case "":
               case null:
                  return null;
               default:
                  this.terms = [new NumericTerm({number: r})];
                  break;
            } 
            
            this.configureModifiers();

            const d20 = this.terms[0];
            //d20.number = 1;
            d20.modifiers = [];
            d20.options.advantage = false;
            d20.options.disadvantage = false;
            d20.options.critical = 20;
            d20.options.fumble = 1;   
            this._formula = this.constructor.getFormula(this.terms);

            return this;
         }
         else
            return await super.configureDialog(obj, options);
      }
   }   

   class CustomJulDamageRoll extends CONFIG.Dice.DamageRoll {
      constructor(formula, data, options) {
         super(formula, data, options);         
      }

      /**
         * Create a DamageRoll from a standard Roll instance.
         * @param {Roll} roll
         * @returns {DamageRoll}
         */
      static fromRoll(roll) {
         const newRoll = new this(roll.formula, roll.data, roll.options);
         Object.assign(newRoll, roll);
         return newRoll;
      }

      // Hit dialog
      static manualDamageDialog(rolls) {
         return new Promise((resolve, reject) => {

            const title = rolls[0].options?.flavor ?? rolls[0].title;
            let damageTypes = CONFIG.DND5E.damageTypes;   
            
            damageTypes['healing'] = {
               label: 'Soins',
               icon: 'systems/dnd5e/icons/svg/hit-points.svg',               
               reference: '',
            };
            //damageTypes['healing'] = 'Soins';

            // Crée les champs de saisie pour chaque type de dégât            
            let damageOtherInputs = Object.entries(damageTypes).map(([key, damageObject]) => {
               if (!rolls.find(r => r.options.type === key))
               {
                 return `<div class="form-group">
                     <label>${damageObject.label} :</label>
                     <input type="text" name="${key}" value="">
                  </div>`;
               }
            }).join("");

            let idx = 0;
            const damageInputs = rolls.map((roll) => {
               // Ajoute une classe spéciale pour les dégâts de force
               let extraClass = (idx++) <= 0 ? "focus-damage" : "";               
               if (roll.options.type)
               {
                 return `<div class="form-group">
                     <label>${damageTypes[roll.options.type].label} (${roll.formula}) :</label>
                     <input type="text" name="${roll.options.type}" class="${extraClass}" value="">
                  </div>`;
               }
               else
                 return '';
            }).join("");

            // Affiche la boîte de dialogue
            let dialogContent = `
               <form>${damageInputs}
                  <br>
                  <p><strong>Autres dégâts&nbsp:</strong></p>
                  ${damageOtherInputs}</form>`;

            new Dialog({
               title: title,
               content: dialogContent,
               buttons: {
                  apply: {
                     icon: "<i class='fas fa-check'></i>",
                     label: "Appliquer",
                     callback: (html) => {
                           let results = [];
                           
                           for (let [damageType, _] of Object.entries(damageTypes)) {
                             let damageAmount = html.find(`[name=${damageType}]`).val();
                             if (damageAmount > 0)
                             {
                               let roll = new CustomJulDamageRoll(damageAmount, rolls[0].data, {
                                 configured: true,
                                 flavor: "Dégâts manuels",
                                 rollMode: 'publicroll',
                                 type: damageType
                               });                               
                               results.push(roll);
                             }                                
                           }

                           if (results.length == 0)
                              rolls.forEach(r => results.push(r));                              

                           resolve(results);
                     }
                  },
                  cancel: {
                     icon: "<i class='fas fa-times'></i>",
                     label: "Annuler"
                  }
               },
               default: "apply",
               close: html => resolve(null),
               render: html => {
                  // Positionne le focus sur les dégâts de force
                  // Utilise setTimeout pour retarder le focus
                  setTimeout(() => {
                     html.find(".focus-damage").focus();
                     }, 50);
               }
         }).render(true);
         });
      }

      static async configureDialog(rolls, {
         title, defaultRollMode, defaultCritical=false, template, allowCritical=true}={}, options={}) {            
            if (isTrustedManualRollForActor(await fromUuid(rolls[0].data.actorUuid)))
            {
               const results = await CustomJulDamageRoll.manualDamageDialog(rolls);
               
               // Remplacement des jets
               rolls.length = 0;
               rolls.push(...results);

               if (results)
                  return results;
               else
                  return await super.configureDialog(rolls, { title, defaultRollMode, defaultCritical, template, allowCritical, options });
            }
            else
               return await super.configureDialog(rolls, { title, defaultRollMode, defaultCritical, template, allowCritical, options });

      }
   }

   CONFIG.Dice.OriginalDamageRoll = CONFIG.Dice.DamageRoll;
   CONFIG.Dice.D20Roll = CustomJulD20Roll;
   CONFIG.Dice.rolls.push(CustomJulD20Roll);
   CONFIG.Dice.DamageRoll = CustomJulDamageRoll;
   CONFIG.Dice.rolls.push(CustomJulDamageRoll);

   console.log(CONFIG.Dice);
   console.info('Dice replaced !');
});

Hooks.once("ready", () => {

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
   
   game.socket.on(socketName, (data) => { 
      switch (data ?? 'close')
      {
         case 'close':
            julsCloseImagePopout();
            break;
      }
   });

});

Hooks.on("dnd5e.preRollAttack", async (context, rollConfig) => {
   
   if (isTrustedManualRollForActor(rollConfig['actor']))
   {
      // On désactive le fastforward pour permettre de saisir les valeurs
      // des dégâts !
      rollConfig['fastForward'] = false;
   }
   
   return true;
});

Hooks.on("dnd5e.preRollDamage", async (context, rollConfig) => {

   if (isTrustedManualRollForActor(rollConfig['actor']))
   {
      // On désactive le fastforward pour permettre de saisir les valeurs
      // des dégâts !
      rollConfig['fastForward'] = false;
   }
   
   return true;
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
      const frames = ["top", "bottom", "side"];

      let orientation = await getImageOrientation(data.image);

      let startTimer = 1000;
      let title = '';
      let subtitle = '';

      let parts = data.title?.split(";") ?? [];
      if (parts.length > 1)
      {         
         title = parts[1].trim();
         if (parts.length > 2)
         {
            subtitle = '— ' + parts[1].trim() + ' —';
            title = parts[2].trim();

            if (parts.length > 4)
               startTimer = parts[4].trim() * 1000;
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
               
         }, 8000); // Delay to match the appearance of the text
      }, startTimer); // Delay to match the appearance of the text
   }
});
