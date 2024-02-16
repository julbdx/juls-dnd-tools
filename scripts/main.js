import constants from "../Constants.js";
import { registerSettings } from "./settings.js";

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

Hooks.once("ready", () => {

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
            let ac = target.actor.data.data.attributes.ac.value; // Cela dépend de votre système de jeu
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
            const damageTypes = CONFIG.DND5E.damageTypes;

            // Crée les champs de saisie pour chaque type de dégât            
            let damageOtherInputs = Object.entries(damageTypes).map(([key, label]) => {
               if (!rolls.find(r => r.options.type === key))
               {
                 return `<div class="form-group">
                     <label>${label} :</label>
                     <input type="text" name="${key}" value="">
                  </div>`;
               }
            }).join("");

            let idx = 0;
            const damageInputs = rolls.map((roll) => {
               // Ajoute une classe spéciale pour les dégâts de force
               let extraClass = (idx++) <= 0 ? "focus-damage" : "";               
               return `<div class="form-group">
                     <label>${damageTypes[roll.options.type]} (${roll.formula}) :</label>
                     <input type="text" name="${roll.options.type}" class="${extraClass}" value="">
                  </div>`;
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

   console.info('Dice replaced !');
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

Hooks.on('renderImagePopout', (app, html, data) => {
	
	if( !game.user.isGM ) {
      
      for (const tag of ['img', 'video'])
      {
         let originalImg = html.find(tag);
      
         if (originalImg.length > 0) {
            // Dupliquer l'élément img
            let clonedImg = originalImg.clone();
            let cloned2Img = originalImg.clone();
            
            // Modifier les classes de l'image originale
            originalImg.attr("class", "my-frame my-frame-bottom");
            
            // Ajouter les classes à l'image clonée
            clonedImg.attr("class", "my-frame my-frame-top");
            cloned2Img.attr("class", "my-frame my-frame-left");
            
            // Insérer l'image clonée dans le DOM, par exemple, après l'original
            originalImg.after(cloned2Img);
            originalImg.after(clonedImg);
         }
      }
   }		
});