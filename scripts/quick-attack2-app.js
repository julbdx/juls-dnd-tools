import { SelectorTokenApp } from './select-token.js';

// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class QuickAttack2App extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "quick-attack2-app",
        classes: ["dnd5e2", "dtjul-window", "dtjul-quick-attack-app"],
        tag: "div",
        position: {
            width: 900,
            height: "auto",        
        },
        window: {
            icon: "fas fa-crosshairs",
        },        

        actions: {
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/quick-attack2-app.hbs",
        }
    };

    /**
     * 
     * @param {*} attackerToken 
     */
    constructor(attackerToken) {
        super();        
    }

    /**
     * Initialisation
     */
    init()
    {        
        
    }    

    /**
     * 
     */
    get title()
    {
        return `Panneau d'attaque`;
    }    

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        

        return super._renderHTML(context, option);
    }

    async refresh()
    {
        
        this.render();
    }    
}