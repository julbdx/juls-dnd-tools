// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

import { JulMerchantSheet } from "./merchant-sheet.js";

export class BuyServiceApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "buy-service-app",
        classes: ["dnd5e2", "dtjul-window", "dtjul-buy-app"],
        tag: "div",
        position: {
            width: 600,
            height: "auto",        
        },
        window: {
            icon: "fas fa-shopping-cart",
        },        

        actions: {
            transactionAction: BuyServiceApp.transaction,
            closeAction: BuyServiceApp.close,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/buy-service-app.hbs",
        }
    };

    constructor(amount, transactionName) {
        super();
        
        this.amount = this.parseCurrency(amount);        
        this.transactionName = transactionName;

        // Ajout des personnages
        let actors = game.actors.filter(a => (a.type == "character" && a.hasPlayerOwner) || (a.type == "group" && a.hasPlayerOwner));        

        // On filtre les acteurs pour lesquels l'utilisateur en cours a les droits de propriétaire
        if (!game.user.isGM)
            actors = actors.filter(actor => actor.testUserPermission(game.user, "OWNER"));

        // Tri des acteurs par type, les groupes en premier, puis par nom 
        actors.sort((a, b) => {
            if (a.type == b.type) {
                return a.name.localeCompare(b.name);
            }
            else {
                return b.type.localeCompare(a.type);
            }
        });

        this.players = [];
        for (let actor of actors) {
            this.players.push({
                id : this.players.length,
                actor: actor,
                funds: JulMerchantSheet.convertCurrencyFromObject(actor.system.currency),
                canBuy: this.canAfford(actor, this.amount),                
                nb: 0,
            });
        }  
    }

    /**
     * 
     */
    get title()
    {
        // Fabrication du titre de la fenêtre : "Dégâts sur <noms des tokens séparés par des virgules>"
        let title = `Achat de ${this.transactionName} (`;

        // Ajout du montant
        let first = true;
        for (const [key, value] of Object.entries(this.amount)) {
            if (value > 0) {
                if (!first) {
                    title += ', ';
                }
                title += `${value} ${key.toUpperCase()}`;
                first = false;
            }
        }

        title += ')';

        return title;
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        context.amount = this.amount;
        context.transactionName = this.transactionName;

        // context.players doit contenir tous les acteurs de type "character", contrôlés par un joueur
        // ainsi que les groupes "party" contrôlés par un joueur
        context.players = [];
        
        // Ajout des personnages
        for (let i = 0; i < this.players.length; i++) {
            // On rafraichit les fonds de l'acteur
            this.players[i].funds = JulMerchantSheet.convertCurrencyFromObject(this.players[i].actor.system.currency);
            // On vérifie si l'acteur peut acheter
            this.players[i].canBuy = this.canAfford(this.players[i].actor, this.amount);
        }
        
        context.players = this.players;
        
        return super._renderHTML(context, option);
    }

    _onRender(context, options) {
    }

    async refresh()
    {
        this.render();
    }

    /**
     * 
     * @param {*} amountStr 
     * @returns 
     */
    parseCurrency(amountStr) {
        const currency = {
          pp: 0,
          gp: 0,
          ep: 0,
          sp: 0,
          cp: 0
        };
      
        const regex = /(\d+)\s*(pp|gp|ep|sp|cp)/gi;
        let match;
        while ((match = regex.exec(amountStr)) !== null) {
          const value = parseInt(match[1]);
          const type = match[2].toLowerCase();
          currency[type] += value;
        }
      
        return currency;
    }

    /**
     * Assez d'argent ?
     * 
     * @param {*} actor 
     * @param {*} cost 
     * @returns 
     */
    canAfford(actor, cost) {
        const currency = actor.system.currency;
      
        // Calculer la valeur totale en pièces de cuivre
        const actorTotalCp = this.convertToCopper(currency);
        const costTotalCp = this.convertToCopper(cost);
      
        if (actorTotalCp < costTotalCp) {
          return false;  // Pas assez d'argent
        }
      
        return true;
    }     

    /**
     * Déduction du coût
     * 
     * @param {*} actor 
     * @param {*} cost 
     * @returns 
     */
    async deductCurrency(actor, cost) {
        const currency = actor.system.currency;
      
        // Calculer la valeur totale en pièces de cuivre
        const actorTotalCp = this.convertToCopper(currency);
        const costTotalCp = this.convertToCopper(cost);
      
        if (actorTotalCp < costTotalCp) {
          return false;  // Pas assez d'argent
        }
      
        // Déduire le coût
        const newTotalCp = actorTotalCp - costTotalCp;
        const newCurrency = this.convertFromCopper(newTotalCp);
      
        // Mettre à jour l'acteur
        await actor.update({ 'system.currency': newCurrency });
        return true;
    }
     
    /**
     * 
     * @param {*} currency 
     * @returns 
     */
    convertToCopper(currency) {
        return (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + currency.cp;
    }
    
    /**
     * 
     * @param {*} totalCp 
     * @returns 
     */
    convertFromCopper(totalCp) {
        const pp = Math.floor(totalCp / 1000);
        totalCp %= 1000;
        const gp = Math.floor(totalCp / 100);
        totalCp %= 100;
        const ep = Math.floor(totalCp / 50);
        totalCp %= 50;
        const sp = Math.floor(totalCp / 10);
        const cp = totalCp % 10;
      
        return { pp, gp, ep, sp, cp };
    }

    /**
     * 
     * @param {*} currency 
     * @returns 
     */
    formatCurrency(currency) {
        let parts = [];
        for (let [key, value] of Object.entries(currency)) {
          if (value != 0) {
            const l = CONFIG.DND5E.currencies[key].label;
            parts.push(`${Math.abs(value)} ${l}`);
          }
        }
        return parts.join(' ');
    }

    /**
     * Transaction
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async transaction(event, target)
    {
        const qty = parseInt(target.dataset.qty);
        const player = this.players[target.dataset.id];

        // On copie le montant de la transaction
        let currency = JSON.parse(JSON.stringify(this.amount));
        // Pour chaque propriété de currency, on multiplie par qty
        for (let [key, value] of Object.entries(currency)) {
            currency[key] = value * qty;
        }

        // On applique la transaction
        const result = await this.deductCurrency(player.actor, currency);
        if (!result) {
            ui.notifications.warn(`${player.actor.name} n'a pas assez d'argent pour compléter l'opération !`);
            return;
        }

        // Message de transaction dans le chat
        // Du style "Julien a dépensé 10 po pour acheter une épée longue." si qty > 0
        // Ou "Julien a reçu 10 po pour vendre/se faire rembourser d'une épée longue." si qty < 0
        const messageContent = `${player.actor.name} a ${qty > 0 ? 'dépensé' : 'reçu'} ${this.formatCurrency(currency)} pour ${qty > 0 ? 'acheter' : 'vendre/se faire rembourser'} ${this.transactionName}.`;

        // Afficher le message dans le chat
        ChatMessage.create({
            user: game.user.id,
            speaker: { alias: player.actor.name },
            content: messageContent
        });

        player.nb += qty;
    
        this.render();
    }

    /**
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static close()
    {
        // On ferme la fenêtre
        this.close();
    }
}