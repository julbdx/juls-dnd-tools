export class JulMerchantSheet extends dnd5e.applications.actor.ActorSheet5eNPC2 {
    static FLAG = 'juls-dnd-tools';
  
    /**
     * Handles Currency from currency.TYPE.value to currency.TYPE for backwords support
     * @param {string} folderPath - The directory to loop through
     */
    static convertCurrencyFromObject(currency) {
        Object.entries(currency).map(([key, value]) => {
        currency[key] = value?.value ?? value ?? 0
        })
        return currency
    }

    /**
     * Retrieve the loot permission for a player, given the current actor system.
     *
     * It first tries to get an entry from the actor's permissions, if none is found it uses default, otherwise returns 0.
     *
     */
    static getLootPermissionForPlayer(actorData, player) {
      let defaultPermission = actorData.ownership.default
      if (player.playerId in actorData.ownership) {
        return actorData.ownership[player.playerId]
      } else if (typeof defaultPermission !== 'undefined') {
        return defaultPermission
      } else {
        return 0
      }
    }

    // Méthode pour personnaliser l'affichage du titre
    _getHeaderButtons() {
      let buttons = super._getHeaderButtons();
      // Supprime la partie XP du titre dans la barre de titre
      // si l'utilisateur n'est pas un MJ, on retire les boutons
      if (!game.user.isGM) {
        buttons = buttons.filter(button => button.label !== "Sheet");
        buttons = buttons.filter(button => button.label !== "Token");
      }
      return buttons;
  }

    get template() {
      Handlebars.registerHelper('ifeq', function (a, b, options) {
        if (a == b) {
          return options.fn(this)
        }
        return options.inverse(this)
      });

      Handlebars.registerHelper('notequal', function (value1, value2, options) {
        return value1 != value2 ? options.fn(this) : options.inverse(this)
      });

      // adding the #equals and #unequals handlebars helper
      Handlebars.registerHelper('equals', function (arg1, arg2, options) {
        return arg1 == arg2 ? options.fn(this) : options.inverse(this)
      })
  
      // Register the 'ifnot' helper
      Handlebars.registerHelper('ifnot', function (condition, options) {
        // Check if the condition is false, null, undefined, or falsy
        if (!condition) {
          return options.fn(this) // Render the block if the condition is falsy
        } else {
          return options.inverse(this) // Render the else block if the condition is true
        }
      })
  
      Handlebars.registerHelper('unequals', function (arg1, arg2, options) {
        return arg1 != arg2 ? options.fn(this) : options.inverse(this)
      })
  
      Handlebars.registerHelper('ifnoteq', function (a, b, options) {
        if (a != b) {
          return options.fn(this)
        }
        return options.inverse(this)
      })
  
      Handlebars.registerHelper('lootsheetprice', function (basePrice, modifier) {
        let proposition = (Math.round(basePrice.value * modifier * 100) / 100).toLocaleString('en');
        //if (basePrice.denomination == 'cp')
        {
          // arrondi à l'entier supérieur
          proposition = Math.round(proposition);
        }
        return proposition;
      })
    
      Handlebars.registerHelper('lootsheetweight', function (weight) {
        return (Math.round(weight.value * 1e5) / 1e5).toString()
      })
  
      const path = 'systems/dnd5e/templates/actors/'
      if (!game.user.isGM && this.actor.limited) return path + 'limited-sheet.hbs'
      return 'modules/juls-dnd-tools/templates/merchant-sheet.hbs'
    }
  
    static get defaultOptions() {
      const options = super.defaultOptions
  
      foundry.utils.mergeObject(options, {
        classes: ['dnd5e2 sheet actor npc vertical-tabs dtjul-merchant'],
        width: 890,
        height: 750,
      })
      return options
    }
  
    async getData() {
      const sheetData = await super.getData()
  
      // Prepare GM Settings
      this._prepareGMSettings(sheetData.actor)
  
      // Prepare isGM attribute in sheet Data
      sheetData.isGM = game.user.isGM;      
  
      let priceModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'priceModifier')
      if (typeof priceModifier !== 'number')
      {
        priceModifier = 1.0;
        await this.actor.setFlag(JulMerchantSheet.FLAG, 'priceModifier', priceModifier);
      }
      
      let decoteModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'decoteModifier')
      if (typeof decoteModifier !== 'number')
      {
        decoteModifier = 0.5;
        await this.actor.setFlag(JulMerchantSheet.FLAG, 'decoteModifier', decoteModifier);
      }
      
      let opened = await this.actor.getFlag(JulMerchantSheet.FLAG, 'opened');
      if (typeof opened !== 'boolean')
        opened = true;

      sheetData.opened = opened;    
      sheetData.gmopened = opened || game.user.isGM;
      sheetData.priceModifier = priceModifier;
      sheetData.decoteModifier = decoteModifier;

      let modifier = Math.round((priceModifier - 1) * 100, 2);
      if (modifier > 0) sheetData.formatedPriceModifier = '+' + modifier; else sheetData.formatedPriceModifier = modifier;

      modifier = Math.round((decoteModifier - 1) * 100, 2);
      if (modifier > 0) sheetData.formatedDecoteModifier = '+' + modifier; else sheetData.formatedDecoteModifier = modifier;

      sheetData.system.currency = JulMerchantSheet.convertCurrencyFromObject(
        sheetData.system.currency,
      );

      if (!this.currentBuyer)
      {
        //this.currentBuyer = game.user.character;
        if (!this.currentBuyer)
        {
          // Toujours pas de buyer, on affiche une boite de dialogue pour 
          // demander au joueur de choisir un personnage qu'il controle
          await this.chooseBuyer();
        }
      }

      sheetData.buyer = this.currentBuyer;
      sheetData.buyerFunds = JulMerchantSheet.convertCurrencyFromObject(
        this.currentBuyer?.system.currency ?? [],
      );
        
      sheetData.myPortrait = this.token?.texture?.src ?? this.actor.prototypeToken.texture?.src ?? null;
      console.log(sheetData.portrait);
  
      // Return data for rendering
      return sheetData;
    }
  
    /* -------------------------------------------- */
    /*  Event Listeners and Handlers
      /* -------------------------------------------- */
  
    /**
     * Activate event listeners using the prepared sheet HTML
     * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
      super.activateListeners(html)
      if (this.options.editable) {
        // Toggle Permissions
        html.find('.permission-proficiency').click((ev) => this._onCyclePermissionProficiency(ev))
        html
          .find('.permission-proficiency-bulk')
          .click((ev) => this._onCyclePermissionProficiencyBulk(ev))
  
        // On désactive le menu contextuel pour les joueurs
        if (!game.user.isGM) {
          // Désactiver le menu contextuel avec un preventDefault sur le clic droit
          html.find('.item-list .item').each((i, item) => {
            $(item).on('contextmenu', event => {
              event.preventDefault();
            });
          });
        }

        // Price Modifier
        html.find('.price-modifier').click((ev) => this._priceModifier(ev));  

        // Toggle Open/Close
        html.find('.store-opening').click((ev) => { ev.preventDefault(); this.toggleOpenClose()});  

        // Buyer Modifier
        html.find('.choose-buyer').click((ev) => this.chooseBuyer());  
      }
    
      // Buy Item
      html.find('.item-buy').click((ev) => this._buyItem(ev))
      //html.find('.item-buyall').click((ev) => this._buyItem(ev, 1))
        
      // Select the <nav> element and find all <a> elements inside it
      const nav = $('.dtjul-merchant nav.tabs')
      const links = nav.find('a.item.control')
  
      // Check if the first tab's data-tab attribute is not "features"
      if (links.first().attr('data-tooltip') !== 'DND5E.Inventory') {
        // Si l'utilisateur est le GM
        if (game.user.isGM) {
          // Move the second <a> to the first position
          if (links.eq(1).length) {
            links.eq(1).insertBefore(links.eq(0)) // Move the second <a> before the first <a>
          }
    
          // Move the fifth <a> to the second position
          if (links.eq(4).length) {
            links.eq(4).insertAfter(nav.find('a.item.control').first()) // Move the fifth <a> to after the new first <a>
          }
    
          // Remove the remaining <a> elements (original first, third, and fourth)
          nav.find('a.item.control').slice(2).remove() // Remove from the third onward
    
          // Set the data-tab attribute to features
          nav.find('a.item.control').first().attr('data-tab', 'features')
    
          // Check if no <li> elements have the 'active' class
          if (!nav.find('a.active').length) {
            // Add the "active" class to the new first <a> element if no other <li> is active
            nav.find('a.item.control').first().addClass('active')
          }
        }
        else{
          // Sinon on supprime tout le reste
          nav.find('a.item.control').slice(1).remove() // Remove from the second onward
        }
      }

      // Désactiver le drag & drop dans la liste d'inventaire      
      if (this._mode == 1) {
        html.find('.item-list .item').each((i, item) => {
          item.setAttribute('draggable', false); // Désactiver la capacité de faire un drag
          $(item).on('dragstart', (event) => {
              event.preventDefault(); // Empêche le comportement de drag & drop
          });            
        });

        // Gestion de la vente !
        html.find('.item-list').on('drop', (event) => {
          this._sellItem(event);
          return false;
        });

        html.find('.inventory-element').on('drop', (event) => {
          this._sellItem(event);
          return false;
        });
      }
    }  
      
    /**
     * Handle sell item
     * @param {*} event 
     * @param {*} all 
     */
    async _sellItem(event, all = 0) {
      event.preventDefault();
  
      let buyer = this.actor;
      if (!buyer || !buyer.prototypeToken.actorLink) {  // Si le marchand est un template alors on ne peut pas acheter directement 
        return ui.notifications.error(`You must sell items to a token.`)
      }

      // event est un DropEvent, on va chercher la donnée qu'il transporte
      let data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
      if (!data) return;
      
      // On cherche l'item par son UUID
      let item = await Item.implementation.fromDropData(data);      

      // On regarde si l'item est un item de la liste d'inventaire du buyer
      // Sinon, on le refuse au motif que ce vendeur n'accepte pas de reprendre un objet qu'il ne vend pas !
      if (!buyer.items.find(i => i.name === item.name)) {
        return ui.notifications.error(`Ce marchand n'accepte pas de reprendre votre objet, il ne vend pas ce genre de marchandise !`);
      }
      
      let seller = item.parent;
      if (!seller)
        return ui.notifications.error(`Impossible de déterminer le vendeur de l'objet !`);

      // On vérifie que l'utilisateur actuel est bien le propriétaire de l'actor seller
      if (!seller.isOwner)
        return ui.notifications.error(`Cet objet n'est pas à vous, vous ne pouvez pas le vendre !`);

      const sellerModifier = buyer.getFlag(JulMerchantSheet.FLAG, 'decoteModifier') ?? 1;

      const price = (item.system.price.value * sellerModifier * 100) / 100;
      const itemCostDenomination = item.system.price.denomination;

      const proceed = await foundry.applications.api.DialogV2.confirm({
        title: `Vendre un objet à ${buyer.name}`,
        content: `<p>Vous allez vendre 1x ${item.name} pour ${price}${itemCostDenomination} à ${buyer.name}.</p>`,
        modal: true,
        rejectClose: false,
      });

      if (proceed)
          this.transaction(seller, buyer, item.id, 1, sellerModifier);      
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle buy item
     * @private
     */
    _buyItem(event, all = 0) {
      event.preventDefault()
 
      let seller = this.actor;
      if (!seller || !seller.prototypeToken.actorLink) {  // Si le marchand est un template alors on ne peut pas acheter directement 
        return ui.notifications.error(`You must purchase items from a token.`)
      }      
  
      const itemId = $(event.currentTarget).parents('.item').attr('data-item-id')

      /** gestion de la vente ici ! */
      let buyer = this.currentBuyer;
      if (!buyer) {
        return ui.notifications.error(`No buyer selected.`);
      }

      let sellerModifier = seller.getFlag(JulMerchantSheet.FLAG, 'priceModifier');
      this.transaction(seller, buyer, itemId, 1, sellerModifier);  
    }

    /**
     * Effectue la transaction
     * 
     * @param {} seller 
     * @param {*} buyer 
     * @param {*} itemId 
     * @param {*} quantity 
     * @returns 
     */
    async transaction(seller, buyer, itemId, quantity, sellerModifier) {
      let sellItem = seller.getEmbeddedDocument('Item', itemId);
  
      if (!sellItem)
        return ui.notifications.error(`Item not found in seller inventory.`)

      // If the buyer attempts to buy more then what's in stock, buy all the stock.
      if (sellItem.system.quantity < quantity) {
        quantity = sellItem.system.quantity;
      }
  
      // On negative quantity we show an error
      if (quantity < 0) {
        ui.notifications.warn("Vous ne pouvez pas acheter un montant négatif de marchandise."); // Message d'avertissement
        return;
      }
  
      // On 0 quantity skip everything to avoid error down the line
      if (quantity == 0) {
        ui.notifications.warn("Pas assez de stock pour acheter."); // Message d'avertissement
        return;
      }
      
      if (!sellerModifier || typeof sellerModifier !== 'number') sellerModifier = 1.0;
  
      let itemCostRaw = Math.round(sellItem.system.price.value * sellerModifier * 100) / 100;
      let itemCostDenomination = sellItem.system.price.denomination;
  
      itemCostRaw *= quantity;
  
      let buyerFunds = foundry.utils.duplicate(
        JulMerchantSheet.convertCurrencyFromObject(buyer.system.currency),
      );
  
      let sellerFunds = foundry.utils.duplicate(
        JulMerchantSheet.convertCurrencyFromObject(seller.system.currency),
      );      
  
      const conversionRates = {
        pp: 1000,
        gp: 100,
        ep: 50,
        sp: 10,
        cp: 1,
      }  
  
      let convert = (funds) => {
        let wallet = 0
        for (const coin in conversionRates) {
          wallet += funds[coin] * conversionRates[coin]
        }
        return wallet
      }
      //why bronze? because there will be no float
      let buyerFundsAsBronze = convert(buyerFunds)
  
      let itemCostInBronze = itemCostRaw * conversionRates[itemCostDenomination]
      // console.log(`itemCostInPlatinum : ${itemCostInPlatinum}`);
  
      // console.log(`buyerFundsAsPlatinum : ${buyerFundsAsPlatinum}`);
      if (itemCostInBronze >= buyerFundsAsBronze) {
        ui.notifications.warn("Pas assez de fonds pour acheter cette marchandise."); // Message d'avertissement
        return
      }
      //maybe realize later
      const GoToAnotherShopToExchange = true
  
      if (buyerFunds[itemCostDenomination] >= itemCostRaw) {
        buyerFunds[itemCostDenomination] -= itemCostRaw
        sellerFunds[itemCostDenomination] += itemCostRaw
      } else {
        let payCoinCount = (coin, coinCost) => {
          let payedThisCoins =
            itemCostInBronze < coinCost
              ? coinCost - (coinCost - Math.abs(itemCostInBronze))
              : coinCost
          return payedThisCoins / conversionRates[coin]
        }
        //we go through all the coins and try to pay off using them
        //a little magic with data types
        let ratesLikeArray = Object.entries(conversionRates)
        ratesLikeArray.sort((a, b) => b[1] - a[1])
        for (const i in ratesLikeArray) {
          let coin = ratesLikeArray[i][0]
          //calculating how many coins of this type I owe
          const amountCoin = buyerFunds[coin]
          if (amountCoin == 0) continue
          let coinCost = amountCoin * conversionRates[coin]
          let payedCoin = Math.floor(payCoinCount(coin, coinCost))
          itemCostInBronze -= payedCoin * conversionRates[coin]
  
          //Subtract from the buyer and add to the seller
          buyerFunds[coin] -= payedCoin
          sellerFunds[coin] += payedCoin
          if (itemCostInBronze == 0) break
        }
        //if we have any left over
  
        if (itemCostInBronze !== 0) {
          let iteration = 0
          let _oldItemCostInbronze
          let _sortStop = itemCostInBronze < 0 ? true : false
          trychange: while (itemCostInBronze != 0) {
            if (_sortStop && itemCostInBronze < 0) {
              ratesLikeArray.sort((a, b) => b[1] - a[1])
              _sortStop = !_sortStop
            } else if (!_sortStop && itemCostInBronze > 0) {
              ratesLikeArray.sort((a, b) => a[1] - b[1])
              _sortStop = !_sortStop
            }
  
            for (const i in ratesLikeArray) {
              let coin = ratesLikeArray[i][0]
              let amountCoinOnByer = buyerFunds[coin]
              let amountCoinOnSeller = sellerFunds[coin]
              let ByerCoinCost = amountCoinOnByer * conversionRates[coin]
              let SellerCoinCost = amountCoinOnSeller * conversionRates[coin]
  
              if (itemCostInBronze > 0) {
                if (amountCoinOnByer == 0) continue
  
                let payedCoin = Math.ceil(payCoinCount(coin, ByerCoinCost))
                itemCostInBronze -= payedCoin * conversionRates[coin]
  
                buyerFunds[coin] -= payedCoin
                sellerFunds[coin] += payedCoin
              } else if (itemCostInBronze == 0) {
                //Need to write a message, how much cp shop did not give
                break trychange
              } else {
                if (amountCoinOnSeller == 0) continue
                let payedCoin = Math.floor(payCoinCount(coin, SellerCoinCost))
                itemCostInBronze += payedCoin * conversionRates[coin]
                if (_oldItemCostInbronze == itemCostInBronze) {
                  if (!GoToAnotherShopToExchange) {
                    let gamemaster = game.users.forEach((u) => {
                      if (u.isGM) {
                        gamemaster = u
                      }
                    })
                    break trychange
                  } else if (iteration > 3) {
                    _oldItemCostInbronze = 0
                    sellerFunds['cp'] += Math.abs(itemCostInBronze)
                  }
                }
                buyerFunds[coin] += payedCoin
                sellerFunds[coin] -= payedCoin
              }
              if (iteration > 6) {
                break trychange
              } else {
                iteration++
              }
            }
            _oldItemCostInbronze = itemCostInBronze
          }
        }
      }
  
      // Update buyer's funds
      buyer.update({
        'system.currency': buyerFunds,
      })
  
      // Update seller's funds
      seller.update({
        'system.currency': sellerFunds,
      })
  
      let moved = await this.moveItems(seller, buyer, [
        {
          itemId,
          quantity,
        },
      ])
  
      for (let m of moved) {
        // trouver l'icône DD5 correspondant à la monnaie (elles sont dans system.currency)
        let icon = `<i class="currency ${itemCostDenomination}" data-tooltip="${itemCostDenomination}"></i>`

        this.chatMessage(
          seller,
          buyer,
          `<span class="dnd5e2">${buyer.name} a acheté ${quantity} x ${m.item.name} pour ${itemCostRaw} ${icon}.</span>`,
          m.item,
        );

        // On envoie un message à l'acheteur
        ui.notifications.info(`${buyer.name} a acheté ${quantity} x ${m.item.name} pour ${itemCostRaw}${itemCostDenomination}.`);
      }
    }

    chatMessage(speaker, owner, message, item) {      
        message =
          `
              <div class="dnd5e chat-card item-card" data-actor-id="${owner._id}" data-item-id="${item._id}">
                  <header class="card-header flexrow">
                      <img src="${item.img}" title="${item.name}" width="36" height="36">
                      <h3 class="item-name">${item.name}</h3>
                  </header>
  
                  <div class="message-content">
                      <p>` +
          message +
          `</p>
                  </div>
              </div>
              `
        ChatMessage.create({
          user: game.user._id,
          speaker: {
            actor: speaker,
            alias: speaker.name,
          },
          content: message,
        });
    }

    async moveItems(source, destination, items) { 
      const updates = []
      const deletes = []
      const additions = []
      const containers = []
      const destUpdates = []
      const results = []
      for (let i of items) {
        let itemId = i.itemId
        let quantity = i.quantity
        let item = source.getEmbeddedDocument('Item', itemId)
    
        // Move all items if we select more than the quantity.
        if (item.system.quantity < quantity) {
          quantity = item.system.quantity
        }
  
        // If container, just move the container
        if (item.type === 'container') {
          containers.push(item);
        } else {          
          const update = {
            _id: itemId,
            'system.quantity': item.system.quantity - quantity,
          }
  
          const isMerchant = this.actor === destination;

          if (update['system.quantity'] === 0 && isMerchant) {  // Attention ici le item est le item vendu, donc isMerchant est à faux si c'est le marchand qui vends !!
            deletes.push(itemId);
          } else {
            updates.push(update);
          }

          // Si le destinaire est un marchand (pas un joueur) et qu'il possède déjà un item avec le même nom, on augmente la quantité
          // plutôt que de créer un nouvel objet
          // On fait de même pour les joueurs si l'item n'est pas une arme ou un équipement
          const isWeaponOrEquipment = item.type === 'weapon' || item.type === 'equipment';          

          let existingItem = destination.items.find((i) => i.name == item.name)
          if (existingItem && (isMerchant || !isWeaponOrEquipment)) {
            let newQty = Number(existingItem.system.quantity) + Number(quantity)
            destUpdates.push({
                _id: existingItem.id,
                system: {
                  quantity: newQty,
                }
              });

            results.push({
                item: item,
                quantity: quantity,
              });
          }
          else {
            let newItem = foundry.utils.duplicate(item)
            newItem.system.quantity = quantity
  
            results.push({
              item: newItem,
              quantity: quantity,
            });
    
            additions.push(newItem);
          }          
        }
      }
  
      if (updates.length > 0) {
        await source.updateEmbeddedDocuments('Item', updates)
      }
  
      if (containers.length > 0) {
        // Containers are different!
        // We have to first look through their contents, create each of those items on the destination
        // Then create a new container and link those items to that
        // We do that by setting the system.container property to the ID of the container on each item that goes into it
  
        copyAllContainers(containers, destination, source);
      }
  
      if (additions.length > 0) {
        await destination.createEmbeddedDocuments('Item', additions)
      }
  
      if (destUpdates.length > 0) {
        await destination.updateEmbeddedDocuments('Item', destUpdates)
      }
  
      if (deletes.length > 0) {
        await source.deleteEmbeddedDocuments('Item', deletes)
      }
  
      return results
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle price modifier
     * @private
     */
    async _priceModifier(event) {
      event.preventDefault()
  
      let priceModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'priceModifier')
      if (typeof priceModifier !== 'number') priceModifier = 1.0 ;
      priceModifier = Math.round(priceModifier * 100);

      let decoteModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'decoteModifier')
      if (typeof decoteModifier !== 'number') decoteModifier = 1.0  
      decoteModifier = Math.round(decoteModifier * 100);
   
      let html = "";
      html += '<p><label>Tarifs (pourcentage):</label> <input type=number min="0" max="500" value="' + priceModifier + '" id="price-modifier-percent"></p>';
      html += '<p><label>Décote (pourcentage):</label> <input type=number min="0" max="100" value="' + decoteModifier + '" id="decote-modifier-percent"></p>';
  
      let d = new Dialog({
        title: 'Price Modifier',
        content: html,
        buttons: {
          one: {
            icon: '<i class="fas fa-check"></i>',
            label: 'Update',
            callback: () => {
              this.actor.setFlag(JulMerchantSheet.FLAG, 'priceModifier', document.getElementById('price-modifier-percent').value / 100);
              this.actor.setFlag(JulMerchantSheet.FLAG, 'decoteModifier', document.getElementById('decote-modifier-percent').value / 100);
            }
          },
          two: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
          },
        },
        default: 'two',
      })
      d.render(true)
    }

    /**
     * Toggle store open or close
     */
    async toggleOpenClose() {
      let opened = await this.actor.getFlag(JulMerchantSheet.FLAG, 'opened');
      if (typeof opened !== 'boolean') opened = false;
      // toggle the value
      opened = !opened;
      // store value
      await this.actor.setFlag(JulMerchantSheet.FLAG, 'opened', opened);

      // update the overlay
      const token = this.token;
      if (token)
      {
        const overlayPath = "icons/svg/padlock.svg";
        if (!opened) {
            await token.update({ overlayEffect: overlayPath });
        } else {
            await token.update({ overlayEffect: null });
        }
      }

      this.render();
    }
  
    
    /* -------------------------------------------- */
  
    /**
     * Handle cycling permissions
     * @private
     */
    _onCyclePermissionProficiency(event) {
      event.preventDefault()
  
      let field = $(event.currentTarget).siblings('input[type="hidden"]')
  
      let level = parseFloat(field.val())
      if (typeof level === undefined) level = 0
  
      const levels = [0, 2, 3] //const levels = [0, 2, 3];
  
      let idx = levels.indexOf(level),
        newLevel = levels[idx === levels.length - 1 ? 0 : idx + 1]
  
      let playerId = field[0].name
  
      this._updatePermissions(this.actor, playerId, newLevel, event)
  
      this._onSubmit(event)
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle cycling bulk permissions
     * @private
     */
    _onCyclePermissionProficiencyBulk(event) {
      event.preventDefault()
  
      let actorData = this.actor.system
  
      let field = $(event.currentTarget).parent().siblings('input[type="hidden"]')
      let level = parseFloat(field.val())
      if (typeof level === undefined || level === 999) level = 0
  
      const levels = [0, 3, 2] //const levels = [0, 2, 3];
  
      let idx = levels.indexOf(level),
        newLevel = levels[idx === levels.length - 1 ? 0 : idx + 1]
  
      let users = game.users.entities
  
      let currentPermissions = foundry.utils.duplicate(actorData.permission)
      for (let u of users) {
        if (u.system.role === 1 || u.system.role === 2) {
          currentPermissions[u._id] = newLevel
        }
      }
      const lootPermissions = new DocumentOwnershipConfig(this.actor)
      lootPermissions._updateObject(event, currentPermissions)
  
      this._onSubmit(event)
    }
  
    _updatePermissions(actorData, playerId, newLevel, event) {
      // Read player permission on this actor and adjust to new level
      let currentPermissions = foundry.utils.duplicate(actorData.ownership)
  
      currentPermissions[playerId] = newLevel
      // Save updated player permissions
      const lootPermissions = new DocumentOwnershipConfig(this.actor)
      lootPermissions._updateObject(event, currentPermissions)
    }  
  
    /* -------------------------------------------- */
  
    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionIcon(level) {
      const icons = {
        0: '<i class="far fa-circle"></i>',
        2: '<i class="fas fa-eye"></i>',
        3: '<i class="fas fa-check"></i>',
        999: '<i class="fas fa-users"></i>',
      }
      return icons[level]
    }
  
    /* -------------------------------------------- */
  
    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionDescription(level) {
      const description = {
        0: 'None (cannot access sheet)',
        2: 'Observer (access to sheet but can only loot or purchase items)',
        3: 'Owner (full access)',
        999: 'Change all permissions',
      }
      return description[level]
    }
  
    /* -------------------------------------------- */
  
    /**
     * Prepares GM settings to be rendered by the loot sheet.
     * @private
     */
    _prepareGMSettings(context) {
      const playerData = [],
        observers = []
      //console.log(game.users);
      //console.log("context", context);
  
      let players = game.users
  
      for (let player of players) {
        //console.log(player);
  
        if (player.character) {
          player.playerId = player._id
          //player.name = player.name;
          player.actor = player.character.name
  
          player.lootPermission = JulMerchantSheet.getLootPermissionForPlayer(context, player)
  
          //console.log("player", player);
  
          player.icon = this._getPermissionIcon(player.lootPermission)
          player.lootPermissionDescription = this._getPermissionDescription(player.lootPermission)
          playerData.push(player)
        }
      }
  
      let loot = {}
      loot.players = playerData
      context.flags.loot = loot
    }

    /**
     * Fait apparaitre une modaldialog pour que le joueur puisse sélectionner
     * le personnage joueur qui va acheter les objets chez ce marchand.
     * La fenêtre propose un bouton par token de personnage joueur présent que le joueur
     * actuel peut contrôler
     */
    async chooseBuyer()
    {
      // Liste des personnages pour lesquels le joueur actif a le contrôle
      const ownedActors = game.actors.filter(actor => 
        actor.isOwner && actor.hasPlayerOwner && (actor.type === 'character' || actor.type == 'group')
      );

      // 1 seul acteur contrôlé ? facile !
      if (ownedActors.length === 0) {
        ui.notifications.warn("Vous ne contrôlez aucun personnage joueur.");
        return;
      }
      else if (ownedActors.length === 1)
      {
        this.currentBuyer = ownedActors[0];
        return;
      }
  
      // Créer les boutons pour chaque personnage
      let selected = await new Promise((resolve, reject) => {
        let buttons = {};
        ownedActors.forEach(actor => {
          buttons[actor.id] = {
            label: actor.name,
            callback: () => resolve(actor)
          };
        });

        // Présenter la boîte de dialogue modale
        new Dialog({
          title: "Sélectionnez un personnage",
          content: "<p>Choisissez l'un de vos personnages pour l'achat des marchandises :</p>",
          buttons: buttons,
          close: () => resolve(null)
        }).render(true);        
      });

      if (selected)
      {
        this.currentBuyer = selected;      
        this.render();
      }
    }
  }
  