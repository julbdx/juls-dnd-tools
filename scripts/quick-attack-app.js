// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class QuickAttackApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "quick-attack-app",
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
            rollAction: QuickAttackApp.roll,
            toggleAdvAction: QuickAttackApp.toggleAdv,
            addDiceAction: QuickAttackApp.addDice,
            removeDiceAction: QuickAttackApp.removeDice,
            toggleActiveAction: QuickAttackApp.toggleActive,
            applyDamageAction: QuickAttackApp.applyDamage,
            changeACAction: QuickAttackApp.changeAC,
            changeDamageAction: QuickAttackApp.changeDamage,
            changeBonusAction: QuickAttackApp.changeBonus,
            itemInfoAction: QuickAttackApp.itemInfo,
            effectToogleAction: QuickAttackApp.effectToogle,
            nextTurnAction: QuickAttackApp.nextTurn,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/quick-attack-app.hbs",
        }
    };

    constructor(attackerToken, targetToken) {
        super();
        
        this.attackerToken = attackerToken;
        this.targetToken = targetToken;        
        this.init();
    }

    /**
     * Initialisation
     */
    init()
    {
        this.attackResults = [];
        this.attacks = [];
        this.damages = [];
        this.concentrationChecks = [];
        this.bonus = 0;
        this.features = [];
        this.statuses = [];
        this.attackerStatuses = []; 
        this.defenderStatuses = [];

        // On récupère les features de l'attaquant        
        if (this.attackerToken.actor?.collections?.items)
        {            
            this.attackerToken.actor.collections.items.forEach(async f => {                
                if (f.type == "feat")
                {
                    // Remplacement de [[lookup @name lowercase]] par le nom du token attaquant
                    f.system.description.value = f.system.description.value.replace(/\[\[lookup @name lowercase\]\]/g, this.attackerToken.name.toLowerCase());
                    
                    this.features.push({
                        id: f.id,
                        img: f.img,
                        name: f.name,
                        description: f.system.description.value,
                    });
                }
            });
        }

        // CA de la cible par défaut
        this.targetAC = this.targetToken.actor.system.attributes.ac.value ?? 10;
        this.baseTargetAC = this.targetAC;

        if (this.attackerToken.actor?.collections?.items)
        {            
            this.attackerToken.actor.collections.items.forEach(item => {                
                if (item.type === "weapon")
                {
                    this.attacks.push({
                        item: item,
                    });
                }
                else if (item.type == "spell")
                {
                    // On parcours les activités à la recherche d'une activité d'attaques

                    // As-t-on encore assez de slot pour lancer ce sort ?
                    item.system.activities.forEach(act => {
                        if (act.type == "attack")
                        {
                            let level = item.system.level;
                            let slots = this.attackerToken.actor.system.spells['spell' + level]; 
                            if (level == 0 || slots.value > 0)
                                this.attacks.push({ item: item, });
                        }
                    });
                }
            });
        }

        // Les effets de l'attaquant
        this.attackerToken.actor.effects.forEach(eff => {
            const s = {
                id: eff.id,
                token: this.attackerToken,
                idx: this.statuses.length,
                img: eff.img,
                name: eff.name,
                description: eff.description,
                active: true,
            };
            this.statuses.push(s);
            this.attackerStatuses.push(s);
        });

        // Les effets de la cible
        this.targetToken.actor.effects.forEach(eff => {
            const s = {
                id: eff.id,
                token: this.targetToken,
                idx: this.statuses.length,
                img: eff.img,
                name: eff.name,
                description: eff.description,
                active: true,
            };
            this.statuses.push(s);
            this.defenderStatuses.push(s);
        });

        // Chargement des enrichers des features
        this.loadFeaturesEnricher().then(() => this.refresh());
    }    

    /**
     * 
     */
    get title()
    {
        return `Attaque rapide de «${this.attackerToken.name}» sur «${this.targetToken.name}»`;
    }

    /**
     * Chargement des enrichers des features
     * 
     */
    async loadFeaturesEnricher()
    {
        // Features ...
        for (let i = 0; i < this.features.length; i++)
            this.features[i].description = await TextEditor.enrichHTML(this.features[i].description, {
                secrets: false,
                entities: true,
                rolls: true,
                links: true, 
                documents: true,
            });

        // Et description des status !
        for (let i = 0; i < this.statuses.length; i++)            
        {
            let d = await TextEditor.enrichHTML(this.statuses[i].description, {
                secrets: false,
                entities: true,
                rolls: true,
                links: true, 
                documents: true,
            });
            
            this.statuses[i].description = '<div style="text-align: left;"><strong>' + this.statuses[i].name +  '</strong>' + d + '</div>';
        }
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        context.attackerStatuses = this.attackerStatuses;
        context.defenderStatuses = this.defenderStatuses;
        context.features = this.features;
        context.attacker = this.attackerToken;
        context.target = this.targetToken;
        context.targetAC = this.targetAC;
        context.attacks = this.attacks;
        context.attackResults = this.attackResults;
        context.damages = this.damages;
        context.bonus = this.bonus;
        context.bonusStr = !this.bonus ? '' : (this.bonus > 0 ? '+' + this.bonus : this.bonus);
        let totalDamage = 0;
        this.damages.forEach(d => {
            totalDamage += d.take;
        });
        context.totalDamage = totalDamage * -1;
        context.currentHP = this.targetToken.actor.system.attributes.hp.value;
        context.projectionHP = context.currentHP - totalDamage;
        if (context.projectionHP < 0)
            context.projectionHP = 0;
        context.projectionColor = context.projectionHP <= 0 ? 'red' : 'forestgreen';
        context.concentrationChecks = this.concentrationChecks;

        return super._renderHTML(context, option);
    }

    async refresh()
    {
        // Pour chaque lancé de dés, recalculer les résultats et lancer les dés de dégâts au besoin
        let damages = {};
        this.concentrationChecks = [];
        let damageTypes = CONFIG.DND5E.damageTypes;
        
        for (let i = 0; i < this.attackResults.length; i++) {
            // Déjà, est-ce que nous avons un jet ?
            if (this.attackResults[i].rolls.length < 1)
            {
                // Non, lançons le dé
                const die = new Roll(this.attackResults[i].formula);
                await die.roll();                
                die.toMessage({rollMode: "roll"}); // On affiche le jet de dé
                this.attackResults[i].rolls.push( { roll : die, die : die.terms[0].results[0].result, result: die.total } );
            }

            // Si nous avons un avantage/désavatange, nous devons regarder tous les jets (au moins 2)
            if (this.attackResults[i].mode != 0)
            {
                // Avons-nous déjà lancé le deuxième dé ?
                if (this.attackResults[i].rolls.length < 2)
                {
                    // Non, lançons le dé
                    const die = new Roll(this.attackResults[i].formula);
                    await die.roll();
                    die.toMessage({rollMode: "roll"}); // On affiche le jet de dé
                    this.attackResults[i].rolls.push( { roll : die, die : die.terms[0].results[0].result, result: die.total } );
                }                
            }

            // Recalcul du résult en prenant en compte le bonus
            for (let j = 0; j < this.attackResults[i].rolls.length; j++)
                this.attackResults[i].rolls[j].result = this.attackResults[i].rolls[j].roll.total + this.bonus;

            // Choisissons le meilleur ou le pire des deux jets
            let roll = this.attackResults[i].rolls[0];                
            // selon le mode on prend le meilleur ou le pire de tous les jets
            for (let j = 0; j < this.attackResults[i].rolls.length; j++)
            {
                this.attackResults[i].rolls[j].type = 'discarded';
                if (this.attackResults[i].mode == 1 && this.attackResults[i].rolls[j].roll.total > roll.roll.total)
                    roll = this.attackResults[i].rolls[j];
                else if (this.attackResults[i].mode == -1 && this.attackResults[i].rolls[j].roll.total < roll.roll.total)
                    roll = this.attackResults[i].rolls[j];
            }

            roll.type = this.attackResults[i].mode < 0 ? 'min' : (this.attackResults[i].mode == 0 ? '' : 'max');
            this.attackResults[i].roll = roll;

            // Calcul du succès
            let critic = false;
            if (this.attackResults[i].roll.die == 1)
                this.attackResults[i].success = false;   // échec critique
            else if (this.attackResults[i].roll.die == 20)
            {
                critic = true;
                this.attackResults[i].success = true;    // réussite critique
            }
            else
                this.attackResults[i].success = (this.attackResults[i].roll.roll.total + this.bonus) >= this.targetAC;


            this.attackResults[i].critic = critic;

            // Si c'est un succès, on tire les dégâts
            if (this.attackResults[i].active && this.attackResults[i].success)
            {
                if (!this.attackResults[i].damage)
                {
                    // On tire les dégâts pour chaque formule de dégâts
                    let rolls = [];
                    this.attackResults[i].damageFormula.forEach(f => {
                        let formula = f.formula;
                        // Si c'est un critique, on double le nombre de dés lancé
                        // On cherche le pattern XdY et on double X avant d'écrire la nouvelle formule
                        if (critic)
                            formula = formula.replace(/(\d+)d(\d+)/g, (match, p1, p2) => (parseInt(p1) * 2) + 'd' + p2);
                        
                        // Injection du type de dégâts derrière les dés
                        formula = formula.replace(/d(\d+)/, 'd$1[' + f.damageType + ']');

                        let weapon = this.attackResults[i].weapon;
                        //let id = weapon.id + '-' + f.damageType;    // pour regrouper les dégâts par type
                        let id = i + '-' + f.damageType;              // pour ne pas regrouper les dégâts
                        rolls.push({
                            id: id,
                            name: weapon.name + ' n°' + (i+1),
                            type: f.damageType,
                            roll: new Roll(formula),
                        });
                    });

                    // Lançons les dés
                    for (let j = 0; j < rolls.length; j++)
                        await rolls[j].roll.roll();

                    // Montrons les jets de dé tous en même temps !
                    rolls.forEach(r => r.roll.toMessage({rollMode: "roll"})); // On affiche le jet de dé;

                    
                    this.attackResults[i].damage = rolls;

                    this.attackResults[i].totalDamage = 0;
                    this.attackResults[i].damage.forEach(d => {
                        this.attackResults[i].totalDamage += d.roll.total;
                    });
                }

                let concentrationDD = 0;

                // Calcul des dommages totaux
                this.attackResults[i].damage.forEach(d => {
                    if (!damages[d.id])
                        damages[d.id] = {
                            id: d.id,
                            type: d.type,
                            properties: this.attackResults[i].weapon.system.properties,
                            reduced: null,
                            label: d.name + ' (' + damageTypes[d.type].label.toLowerCase() + ')',
                            img: damageTypes[d.type].icon,  
                            // Pour l'activation, on va chercher les anciens dommages si existant pour reprendre le active
                            active: this.damages.find(dd => dd.id == d.id) ? this.damages.find(dd => dd.id == d.id).active : 0,
                            normal: false,
                            full: false,
                            resistance: false,
                            immunity: false,
                            total: 0,
                            take: 0,
                            nb: 0,
                        };

                    // Calcul des dommages réels
                    damages[d.id].total += d.roll.total;                    

                    // Calcul des flags
                    damages[d.id].normal = false;
                    damages[d.id].full = false;
                    damages[d.id].resistance = false;
                    damages[d.id].immunity = false;
                    switch (damages[d.id].active)
                    {
                        case 1: // pas d'activation, on prend le résultat
                            damages[d.id].full = true;
                            break;
                        case 2: // résistance, on divise par 2
                            damages[d.id].resistance = true;
                            break;
                        case 3: // immunité, on ignore
                            damages[d.id].immunity = true;
                            break;
                        default:
                            damages[d.id].normal = true;
                            break;
                    }

                    const realDmg = this.targetToken.actor.calculateDamage( [ {
                        value: d.roll.total, 
                        type: d.type,
                        properties: this.attackResults[i].weapon.system.properties, 
                    } ]); 
                                        
                    let computedRealDmg = 0;

                    if (damages[d.id].active == 0)
                    {
                        realDmg.forEach(dmg => {
                            computedRealDmg += dmg.value;

                            if (dmg.active.immunity)
                                damages[d.id].reduced = 'immunity';
                            else if (dmg.active.resistance)
                                damages[d.id].reduced = 'resistance';
                            else if (dmg.active.vulnerability)
                                damages[d.id].reduced = 'vulnerability';
                        });
                    }
                    else if (damages[d.id].active == 1)
                    {
                        damages[d.id].reduced = 'full';
                        computedRealDmg = d.roll.total; 
                    }
                    else if (damages[d.id].active == 2)
                    {
                        damages[d.id].reduced = 'resistance';
                        computedRealDmg = d.roll.total / 2.0; 
                    }
                    else
                    {
                        damages[d.id].reduced = 'immunity';
                    }

                    computedRealDmg = Math.ceil(computedRealDmg);
                    if (computedRealDmg != 0)
                    {
                        concentrationDD += computedRealDmg;
                        damages[d.id].nb = 1;
                        damages[d.id].take += computedRealDmg;
                    }
                });

                let concentrationcheck = Math.floor(concentrationDD / 2);
                if (concentrationcheck < 10)
                    concentrationcheck = 10;

                this.concentrationChecks.push({ source: this.attackResults[i].weapon.name, damage: concentrationDD, dd: concentrationcheck });
            }
        }

        // conversion damages en array dans this.damages
        this.damages = Array.from(Object.values(damages));

        // Si la cible n'est pas sous concentration, alors on retire les checks de concentration
        // pour savoir, on regarde si elle a la propriété "concentration" dans ses effets
        const concentration = this.targetToken.actor.statuses.has("concentrating");

        if (!concentration)
            this.concentrationChecks = [];

        this.render();
    }

    /**
     * Affichage des informations d'item
     * 
     * @param {} event 
     * @param {*} target 
     */
    static async itemInfo(event, target)
    {
        const itemId = target.dataset.item;
        const item = this.attackerToken.actor.collections.items.get(itemId);
        if (item)
            item.sheet.render(true);
    }

    /**
     * Affichage des informations d'effect
     * 
     * @param {} event 
     * @param {*} target 
     */
    static async effectToogle(event, target)
    {
        const effectId = target.dataset.idx;
        const status = this.statuses.find(s => s.idx == effectId);
        if (status)
        {
            status.active = !status.active;

            if (status.active)
            {
                if (status.effect)
                {
                    let n = await status.token.actor.createEmbeddedDocuments("ActiveEffect", [status.effect]);
                    status.id = n[0].id;
                }
            }
            else
            {
                const effect = status.token.actor.effects.find(eff => eff.id == status.id);
                if (effect)
                {
                    status.effect = effect;
                    await status.token.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id])
                }
            }            
        }

        this.render();
    }

    /**
     * Modifie la classe d'armure enregistrée
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async changeAC(event, target)
    {
        let bonus = parseInt(target.dataset.mode);
        if (bonus == 0)
            this.targetAC = this.baseTargetAC;
        else
            this.targetAC += bonus;

        await this.refresh();
    }

     /**
     * Active/désactive une ligne de dommage
     * 
     * @param {*} event 
     * @param {*} target 
     */
     static async changeDamage(event, target)
     {
        const id = target.dataset.damage;
        // on cherche les dommages concernés        
        let d = this.damages.find(d => d.id == id);
        if (d)
            d.active = parseInt(target.dataset.mode);

        // recalcul
        await this.refresh();
     } 
     
     /**
     * Change le bonus général
     * 
     * @param {*} event 
     * @param {*} target 
     */
     static async changeBonus(event, target)
     {
        // On change le bonus
        this.bonus += parseInt(target.dataset.mode);

        // recalcul
        await this.refresh();
     }

    /**
     * Ajoute un dé à l'attaque
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async addDice(event, target)
    {
        const idx = target.dataset.attack;
        let attack = this.attackResults[idx];
        
        // Ajoutons le dé
        const die = new Roll(attack.formula);
        await die.roll();
        die.toMessage({rollMode: "roll"}); // On affiche le jet de dé
        attack.rolls.push( { roll : die, die : die.terms[0].results[0].result, result: die.total } );

        // Si on est en mode normal, on passe en mode avantage (car nous avons plus d'un dé)
        if (attack.mode == 0)
            attack.mode = 1;        

        // On recalcule
        await this.refresh();
    }

    /**
     * Retire un dé à l'attaque
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async removeDice(event, target)
    {
        const idx = target.dataset.attack;
        let attack = this.attackResults[idx];
        
        // Retirons le dernier dé
        if (attack.rolls.length > 0)
            attack.rolls.pop();

        if (attack.rolls.length < 2)    // On repasse à normal si on a moins de 2 dés
            attack.mode = 0;

        // On recalcule
        await this.refresh();
    }
    
    /**
     * Toggle advantage/disadvantage/normal
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async toggleAdv(event, target)
    {
        const idx = target.dataset.attack;
        let attack = this.attackResults[idx];
        // Switch mode
        switch (attack.mode)
        {
            case 0: // On est normal, on passe avec avantage
                attack.mode = 1;
                break;
            case 1: // avantage, on passe en désavantage
                attack.mode = -1;
                break;
            case -1: // désavantage, on repasse en normal
                attack.mode = 0;
                break;
        }

        // On recalcule
        await this.refresh();
    }

    /**
     * Toggle active dice
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async toggleActive(event, target)
    {
        const idx = target.dataset.attack;
        let attack = this.attackResults[idx];

        // Switch active
        attack.active = !attack.active;        

        // On recalcule
        await this.refresh();
    }

    /**
     * Roll prepared dice !
     * 
     * @param {*} roll 
     */
    static async roll(event, target)
    {
        const weapon = this.attackerToken.actor.collections.items.get(target.dataset.weapon);

        this.attackResults.push({
            idx: this.attackResults.length,
            formula: "1d20 + " + (weapon.labels.modifier ?? '0'),
            weapon: weapon,
            roll: null,
            rolls: [],
            mode: parseInt(target.dataset.mode),
            damageFormula: weapon.labels.damages,
            totalDamage: 0,
            damage: null,
            active: true,
            success: false,
        });

        await this.refresh();
    }

    /**
     * Appliquer les dommages à la cible
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async applyDamage(event, target)
    {
        // On fait un résumé des dégâts dans une chatcard diffusée par le jeton target :
        // - une ligne par attaque qui a réussi avec le nom de l'arme et les dégâts infligés (type + résistance + dégâts pour chaque type de dégats)
        // - une ligne par attaque râtée
        // - et enfin une ligne pour chaque jet de concentration effectué, réussi ou raté
        let chatContent = `<h2>Attaques subies</h2><ul>`;
        for (let i = 0; i < this.damages.length; i++)
        {
            let d = this.damages[i];
            //chatContent += `<li>${d.nb}x <strong>${d.label}</strong> : `;
            chatContent += `<li><strong>${d.label}</strong> : `;
            chatContent += `${d.take}`;
            if (d.reduced)
                chatContent += ` (<i class="fas fa-shield-alt"></i>${d.reduced})`;
            chatContent += `</li>`;
        }

        // Affiche du nombre d'attaque râtée par weapon, de la forme "4x épée courte: râtée"
        let failedAttacksByWeapon = {};
        this.attackResults.filter(a => !a.success).forEach(a => {
            if (!failedAttacksByWeapon[a.weapon.id])
                failedAttacksByWeapon[a.weapon.id] = 0;
            failedAttacksByWeapon[a.weapon.id]++;
        }
        );
        for (let weaponId in failedAttacksByWeapon)
        {
            let weapon = this.attackerToken.actor.collections.items.get(weaponId);
            chatContent += `<li>${failedAttacksByWeapon[weaponId]}x <strong>${weapon.name}</strong> : râtée</li>`;
        }

        // On applique les dégâts à la cible tous en même temps
        let totalDamage = 0;
        this.damages.forEach(d => {
            totalDamage += d.take;
        });

        await this.targetToken.actor.applyDamage( [ {
            value: totalDamage, 
            //type: d.type,
            //properties: d.properties, 
        } ]);

        // Si après, la cible est morte (pv <= 0), on lui met l'état "mort" si ce n'est pas un PJ
        let token = this.targetToken;
        
        if (token.actor.system.attributes.hp.value <= 0)
        {       
            await token.actor.toggleStatusEffect("prone");
            await token.actor.toggleStatusEffect("unconscious");
            
            if (!token.actor.hasPlayerOwner) {                
                await token.actor.toggleStatusEffect("dead");
            }
        }

        // On lance les jets de concentration
        for (let i = 0; i < this.concentrationChecks.length; i++)
        {
            if (token.actor.system.attributes.hp.value <= 0)
                break;   // Il est mort, il n'y a plus de concentration, pas besoin de checker
            let c = this.concentrationChecks[i];
            
            const r = await token.actor.rollConcentration({
                targetValue: c.dd,
            });

            if (r && r.total < c.dd)
            {
                // failed ! 
                // on retire toutes les concentrations du token
                let concentrationEffects = token.actor.effects.filter(eff => eff.name.toLowerCase().includes("concentrat"));

                chatContent += `<li>✖ Concentration : ${c.source} : ${r.total}/${c.dd} : raté !</li>`;                

                for (let effect of concentrationEffects) {
                    await effect.delete();
                }
                
                // Et c'est fini,
                break;
            }
            else if (r)
            {
                chatContent += `<li>✔ Concentration : ${c.source} : ${r.total}/${c.dd} : réussi !</li>`;
            }
            else
                chatContent += `<li>✔ Concentration : ignoré !</li>`;
        }

        chatContent += `</ul>`;
        
        // On envoie le message
        let chatData = {
            user: game.user._id,
            speaker: ChatMessage.getSpeaker({ token: this.targetToken.document }),
            content: chatContent,        
        };
        ChatMessage.create(chatData);
        
        // On avance l'initiative et on ferme la fenêtre
        const combat = game.combat;
        if (combat)
        {
            const current = combat.combatant;
            const next = combat.turns.findIndex(t => t.id == current.id) + 1;
            if (next >= combat.turns.length)
                await combat.nextRound();
            else
                await combat.update({ turn: next });
        }

        // On ferme la fenêtre 
        this.close();
    }

    /**
     * Next round
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async nextTurn(event, target)
    {
        // On avance l'initiative et on ferme la fenêtre
        const combat = game.combat;
        if (combat)
        {
            const current = combat.combatant;
            const next = combat.turns.findIndex(t => t.id == current.id) + 1;
            if (next >= combat.turns.length)
                await combat.nextRound();
            else
                await combat.update({ turn: next });
        }

        // On ferme la fenêtre 
        this.close();
    }
}