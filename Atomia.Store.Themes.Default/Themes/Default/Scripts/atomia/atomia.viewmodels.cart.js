﻿/* jshint -W079 */
var Atomia = Atomia || {};
Atomia.ViewModels = Atomia.ViewModels || {};
/* jshint +W079 */

(function (exports, _, ko, utils, cartApi) {
    'use strict';

    function toCartApiData(cart) {
        var apiCart = {
            CampaignCode: cart.campaignCode(),
            CartItems: []
        };

        _.each(cart.cartItems(), function (cartItem) {
            var apiItem = {
                ArticleNumber: ko.unwrap(cartItem.ArticleNumber),
                Quantity: ko.unwrap(cartItem.Quantity) || 1,
                CustomAttributes: []
            };

            var renewalPeriod = ko.unwrap(cartItem.renewalPeriod);

            if (renewalPeriod) {
                apiItem.RenewalPeriod = {
                    Period: renewalPeriod.Period,
                    Unit: renewalPeriod.Unit
                };
            }
            else {
                apiItem.RenewalPeriod = null;
            }

            _.each(cartItem.attrs, function (value, key) {
                if (value != null) {
                    apiItem.CustomAttributes.push({
                        Name: key,
                        Value: value
                    });
                }
            });

            apiCart.CartItems.push(apiItem);
        });

        return apiCart;
    }

    /** Update 'cart' with 'cartData'. */
    function updateCart(cart, cartData) {
        cart.cartItems.removeAll();

        _.each(cartData.CartItems, function (cartItemData) {

            cartItemData.attrs = {};
            _.each(cartItemData.CustomAttributes, function (attr) {
                cartItemData.attrs[attr.Name] = attr.Value;
            });
            cartItemData.renewalPeriod = cartItemData.RenewalPeriod;

            var item = cart.createCartItem(cartItemData);
            var cartItem = addCartItemExtensions(cart, item);

            cart.cartItems.push(cartItem);
        });

        cart.subTotal(cartData.SubTotal);
        cart.total(cartData.Total);
        cart.tax(cartData.Tax);
        cart.campaignCode(cartData.CampaignCode);

        utils.publish('cart:update');
    }

    /**
     * Create a cart item view model.
     * @param {Object} instance - The item to create cart item from.
     * @returns The created cart item.
     */
    function CartItem(cartItemData) {
        var self = this;

        self.id = _.uniqueId('tmp-cartitem-');
        
        /** 
         * Equality comparer between this item and 'other'. Defaults to comparing 'Id' properties. 
         * @param {Object} other - The item to compare to.
         */
        self.equals = function equals(other) {
            return self.id === other.id;
        };

        /** 
         * Collects custom options (renewal period and domain name) of item.
         * @returns {string[]} Array of custom options.
         */
        self.customOptions = function customOptions() {
            var options = [],
                domainName;

            if (self.RenewalPeriod) {
                options.push(self.RenewalPeriod.Display);
            }

            if (!self.isDomainItem()) {
                domainName = self.getDomainName();

                if (domainName !== undefined) {
                    options.push(domainName);
                }
            }

            return options;
        };

        _.extend(self, cartItemData);
    };

    
    /** Create view model for cart. */
    function CartModel() {
        var self = this;
        
        self.domainCategories = [];
        self.cartItems = ko.observableArray();
        self.subTotal = ko.observable(0);
        self.total = ko.observable(0);
        self.tax = ko.observable(0);
        self.campaignCode = ko.observable('');
        
        self.numberOfItems = ko.pureComputed(function numberOfItems() {
            return self.cartItems().length;
        });
        
        self.isEmpty = ko.pureComputed(function isEmpty() {
            return self.numberOfItems() <= 0;
        });

        self.createCartItem = function createCartItem(cartItemData) {
            return new CartItem(cartItemData);
        };

        /** Items in cart that are domain items, like registration or transfer */
        self.domainItems = function domainItems() {
            return _.filter(self.cartItems(), function (item) {
                return _.contains(self.domainCategories, item.Category);
            });
        };

        /** Distinct article numbers of items in cart. */
        self.articleNumbers = function articleNumbers() {
            return _.uniq(_.map(self.cartItems(), function (item) {
                return item.ArticleNumber;
            }));
        };

        /** Distinct categories of items in cart. */
        self.categories = function categories() {
            return _.uniq(_.map(self.cartItems(), function (item) {
                return item.Category;
            }));
        };

        /** Check if cart contains item that 'equals' 'item'. */
        self.contains = function contains(item) {
            var isInCart = _.any(self.cartItems(), function (cartItem) {
                return item.equals(cartItem);
            });

            return isInCart;
        };

        /** Get first item in cart that 'equals' 'item'. */
        self.getExisting = function getExisting(item) {
            var itemInCart = _.find(self.cartItems(), function (cartItem) {
                return item.equals(cartItem);
            });

            return itemInCart;
        };

        /** Add 'item' to cart and recalculate. Optionally set 'recalculate' to false. */
        self.add = function add(item, recalculate) {
            var cartItem;

            if (recalculate === undefined) {
                recalculate = true;
            }

            if (!self.contains(item)) {
                cartItem = self.createCartItem(item);
                self.cartItems.push(cartItem);

                if (recalculate === true) {
                    cartApi.recalculateCart(toCartApiData(self), function (result) {
                        updateCart(self, result.Cart);

                        utils.publish('cart:add', cartItem);
                    });
                }
            }
        };

        /** Remove 'item' from cart and recalculate. Optionally set 'recalculate' to false. */
        self.remove = function remove(item, recalculate) {
            var itemInCart;

            if (recalculate === undefined) {
                recalculate = true;
            }

            if (self.contains(item)) {
                itemInCart = _.find(self.cartItems(), function (cartItem) {
                    return item.equals(cartItem);
                });

                if (itemInCart !== undefined) {
                    self.cartItems.remove(itemInCart);

                    if (recalculate === true) {
                        cartApi.recalculateCart(toCartApiData(self), function (result) {
                            updateCart(self, result.Cart);

                            utils.publish('cart:remove', itemInCart);

                            if (itemInCart.isDomainItem()) {
                                self.clearDomainItem(itemInCart);
                            }
                        });
                    }
                }
            }
        };

        /** Add 'item' to or remove 'item' from cart and recalculate. Optionally set 'recalculate' to false. */
        self.addOrRemove = function addOrRemove(item, recalculate) {
            self.contains(item) ? self.remove(item, recalculate) : self.add(item, recalculate);
        };

        /** Associate 'domainName' to 'mainItem'. Optionally set 'recalculate' to false. */
        self.addDomainName = function addDomainName(mainItem, domainName, recalculate) {
            var mainInCart = self.getExisting(mainItem),
                existingDomainName;

            if (recalculate === undefined) {
                recalculate = true;
            }

            if (mainInCart === undefined) {
                throw new Error('mainItem is not in cart.');
            }

            existingDomainName = mainInCart.getDomainName();

            if (existingDomainName !== domainName) {
                mainInCart.attrs.DomainName = domainName;

                if (recalculate === true) {
                    cartApi.recalculateCart(toCartApiData(self), function (result) {
                        updateCart(self, result.Cart);
                    });
                }
            }
        };

        /** Remove any domain name associations from 'mainItem'. Optionally set 'recalculate' to false.*/
        self.removeDomainName = function removeDomainName(mainItem, recalculate) {
            var mainInCart = self.getExisting(mainItem);

            if (recalculate === undefined) {
                recalculate = true;
            }

            if (mainInCart === undefined) {
                throw new Error('mainItem is not in cart.');
            }

            if (mainInCart.getDomainName() !== undefined) {
                mainInCart.attrs.DomainName = undefined;

                if (recalculate === true) {
                    cartApi.recalculateCart(toCartApiData(self), function (result) {
                        updateCart(self, result.Cart);
                    });
                }
            }
        };

        /** Remove any associations to domain name tied to 'domainItem' from any other items in cart. */
        self.clearDomainItem = function ClearDomainItem(domainItem) {
            var domainNameToRemove = domainItem.getDomainName();

            _.each(self.cartItems(), function (item) {
                if (!domainItem.equals(item) && item.getDomainName() === domainNameToRemove) {
                    self.removeDomainName(item);
                }
            });
        };

        /** Load cart with JSON data from 'getCartResponse'. */
        self.load = function load(getCartResponse) {
            updateCart(self, getCartResponse.data.Cart);

            if (getCartResponse.data.DomainCategories !== undefined) {
                self.domainCategories = getCartResponse.data.DomainCategories;
            }
        };

        /** Add 'campaignCode' to cart. Replaces any existing campaign code and recalculates cart. */
        self.addCampaignCode = function addCampaignCode(campaignCode) {
            if (!_.isString(campaignCode) || campaignCode === '') {
                throw new Error('campaignCode must be a non-empty string.');
            }

            self.campaignCode(campaignCode);

            cartApi.recalculateCart(toCartApiData(self), function (result) {
                updateCart(self, result.Cart);

                utils.publish('cart:addCampaignCode', campaignCode);
            });
        };

        /** Remove campaign code from cart and recalculate. */
        self.removeCampaignCode = function removeCampaignCode() {
            self.campaignCode('');

            cartApi.recalculateCart(toCartApiData(self), function (result) {
                updateCart(self, result.Cart);

                utils.publish('cart:removeCampaignCode');
            });
        };
    }

    /** 
     * Extends 'item' with cart helper methods.
     * @param {Object} cart - The cart to apply helpers to.
     * @param {Object} item - The item to extend with helper methods.
     * @returns {Object} The extended item.
     */
    function addCartItemExtensions(cart, item) {
        var cartExtensions;

        if (item.equals === undefined) {
            item.equals = function equals(other) {
                return item.ArticleNumber === other.ArticleNumber;
            };
        }

        cartExtensions = {
            isInCart: ko.computed(function isInCart() {
                return cart.contains(item);
            }).extend({ notify: 'always' }),
            
            getItemInCart: function getItemInCart() {
                return cart.getExisting(item);
            },

            addToCart: function addToCart() {
                return cart.add(item);
            },

            removeFromCart: function removeFromCart() {
                return cart.remove(item);
            },

            toggleInCart: function toggleInCart() {
                cart.addOrRemove(item);
            },

            getDomainName: function getDomainName() {
                return item.attrs.DomainName;
            },

            isDomainItem: function isDomainItem() {
                return _.contains(cart.domainCategories, item.Category);
            },

            isRemovable: function isRemovable() {
                return item.attrs.NotRemovable !== 'true';
            }
        };

        return _.extend(item, cartExtensions);
    }

    
    /* Module exports */
    _.extend(exports, {
        CartItem: CartItem,
        CartModel: CartModel,
        addCartItemExtensions: addCartItemExtensions
    });

})(Atomia.ViewModels, _, ko, Atomia.Utils, Atomia.Api.Cart);
