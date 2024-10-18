// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class RestsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "rests-app",
        classes: ["dnd5e2", "dtjul-window", "dtjul-rests-app"],
        tag: "div",
        position: {
            width: 600,
            height: "auto",        
        },
        window: {
            icon: "fas fa-bed",
        },        

        actions: {
            chooseRestTypeAction: RestsApp.chooseRestType,
            chooseActorAction: RestsApp.chooseActor,
            chooseExhaustionAction: RestsApp.chooseExhaustion,
            consumeAction: RestsApp.consume,
            consumeDieAction: RestsApp.consumeDie,
            closeAction: RestsApp.close,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/rests-app.hbs",
        }
    };

    constructor() {
        super();
        
        // Ajout des personnages
        let actors = game.actors.filter(a => (a.type == "character" && a.hasPlayerOwner));

        // Tri des acteurs par type, les groupes en premier, puis par nom 
        actors.sort((a, b) => {
            return b.type.localeCompare(a.type);
        });

        // On filtre les acteurs pour lesquels l'utilisateur en cours a les droits de propriétaire
        if (!game.user.isGM)
            actors = actors.filter(actor => actor.testUserPermission(game.user, "OWNER"));

        this.restType = 'short';
        this.players = [];
        for (let actor of actors) {

            let die = [];
            for (let c of actor.system.attributes.hd.classes)
            {                
                for (let j = 0; j < c.system.levels - c.system.hitDiceUsed; j++)
                {
                    die.push({
                        id: die.length,
                        dice: c.system.hitDice,
                        class: c,
                        consumed: false,
                    });
                }
            }            

            this.players.push({
                id : this.players.length,
                actor: actor,
                die_hp: die,
                hp: 0,
                max_hp: actor.system.attributes.hp.max,
                current_hp: actor.system.attributes.hp.value,
                after_hp: 0,
                resting: true,
                exhaustion: false,
                statuses: actor.effects.filter(s => s.label.startsWith('Exhaustion ')),
                food: [],
            });
        }  
    }

    /**
     * 
     */
    get title()
    {
        // Fabrication du titre de la fenêtre : "Dégâts sur <noms des tokens séparés par des virgules>"
        return `Gestion du Repos`;
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        // context.players doit contenir tous les acteurs de type "character", contrôlés par un joueur
        // ainsi que les groupes "party" contrôlés par un joueur
        context.players = [];
        
        // Ajout des personnages
        for (let i = 0; i < this.players.length; i++) {
            // On regarde dans l'inventaire de l'acteur s'il a de l'eau
            let food = [];                        

            if (this.players[i].actor.items) {                
                for (let item of this.players[i].actor.items) {
                    if (item.type == "consumable" && item.system.type.value == "food") {                        
                        let water = (item.system.identifier == "waterskin");
                        if (water || item.system.quantity > 0)
                            food.push({ 
                                id: food.length,
                                item: item, 
                                food: !water,
                                water: water,
                                qty: item.system.uses.value * item.system.quantity });
                    }
                }
            }

            this.players[i].food = food;
            this.players[i].after_hp = this.players[i].current_hp + this.players[i].hp;
        }
        
        context.players = this.players;
        context.short_rest = this.restType == 'short';
        context.long_rest = this.restType == 'long';        
        
        return super._renderHTML(context, option);
    }

    _onRender(context, options) {
        let hp = this.element.querySelector("input[name=hp]");
        if (hp)
            hp.addEventListener("change", (e) => { this.changeHP(e, e.target); });        
    }

    async refresh()
    {
        this.render();
    }

    controlHP(player, value)
    {
        const max = player.max_hp - player.current_hp;
        if (value > max)
            value = max;
        player.hp = value;
    }

    /**
     * Modifie le nombre de PV restauré pour un acteur
     * 
     * @param {*} roll 
     */
    changeHP(event, target)
    {        
        const player = this.players[target.dataset.actor];
        this.controlHP(player, parseInt(target.value));

        this.render();
    }

    /**
     * Choix du type de repos
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static chooseRestType(event, target)
    {
        this.restType = target.dataset.value;        
    
        this.refresh();
    }

    /**
     * Transaction
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static chooseActor(event, target)
    {
        const player = this.players[target.dataset.id];
        if (player)
            player.resting = !player.resting;
    
        this.refresh();
    }

    /**
     * Transaction
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static chooseExhaustion(event, target)
    {
        const player = this.players[target.dataset.actor];
        if (player)
            player.exhaustion = !player.exhaustion;
    
        this.refresh();
    }

    /**
     * Consommation d'un objet
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async consumeDie(event, target)
    {
        // On choppe l'acteur
        const player = this.players[target.dataset.actor];
        if (player)
        {
            // On choppe le dé
            const die = player.die_hp[target.dataset.value];
            if (die)
            {
                // On consomme le dé
                die.consumed = !die.consumed;

                this.refresh();
            }
        }
    }

    /**
     * Consommation d'un objet
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async consume(event, target)
    {
        // On choppe l'acteur
        const player = this.players[target.dataset.actor];
        if (player)
        {
            // On choppe l'objet
            const food = player.food[target.dataset.value];
            if (food)
            {
                // On consomme l'objet s'il est consommable
                let item = food.item;
                if (item.system.uses.value > 0)
                {                    
                    // Si l'objet est vide après utilisation, on regarde s'il reste des quantités de cette objet
                    // si c'est le cas, on met à jour sa quantité dans l'inventaire
                    // sinon on le retire de l'inventaire si l'ont doit le supprimer quand il est vide
                    if (item.system.uses.value == 1 && item.system.uses.autoDestroy)
                    {
                        // On enlève une quantité de l'objet
                        await item.update({ "system.quantity": item.system.quantity - 1 });
                    }
                    else
                    {
                        console.log(item.system.uses);
                        await item.update({ "system.uses.spent": item.system.uses.spent +1 });
                    }
                }

                this.refresh();
            }
        }
    }

    /**
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async close()
    {
        // Ok, appliquons tout ça ...
        for (let player of this.players)
        {
            if (!player.resting)
                continue;

            if (this.restType == 'short')
            {                
                // On met à jour les PV            
                await player.actor.update({ "system.attributes.hp.value": player.current_hp + player.hp });

                // On met à jour les dés de vie
                for (let die of player.die_hp)
                {
                    if (die.consumed)
                        await die.class.update({ "system.hitDiceUsed": die.class.system.hitDiceUsed + 1 });
                }

                await player.actor.shortRest({ dialog: false });
            }
            else if (this.restType == 'long')
            {
                // Faire faire un repos long à l'acteur
                await player.actor.longRest({ dialog: false });

                // Les repos long retirent un jeton d'épuisement à condition de ne pas en cumuler un autre
                if (!player.exhaustion)
                {
                    // On retire le status "Exhaustion 5", si pas trouvé, "Exhaustion 4", etc.
                    for (let i = 5; i >= 1; i--)
                    {
                        let effect = player.actor.effects.find(e => e.label == `Exhaustion ${i}`);
                        if (effect)
                        {
                            await effect.delete();
                            break;
                        }
                    }
                }
            }

            if (player.exhaustion)
            {
                // On cherche les éventuels status d'épuisement "Exhaustion 1", "Exhaustion 2", etc.
                // On ajoute le status qui suit le dernier trouvé
                let exhaustion = 0;
                for (let i = 1; i <= 5; i++)
                {
                    let effect = player.actor.effects.find(e => e.label == `Exhaustion ${i}`);
                    if (effect)
                    {
                        exhaustion = i;
                        break;
                    }
                }

                // On ajoute le status "Exhaustion 1", si pas trouvé, "Exhaustion 2", etc.
                if (exhaustion < 5)
                {
                    await game.dfreds.effectInterface.addEffect({ effectName: "Exhaustion " + (exhaustion + 1), uuid: player.actor.uuid });    
                }
            }
        }

        // On ferme la fenêtre
        this.close();
    }
}