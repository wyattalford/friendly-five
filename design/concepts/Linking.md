# Linking

## Purpose

Let users share a reference to an item without requiring recipients to locate it
manually.

## Principle

Wyatt creates a link for an agreement and shares its token with Alex. Resolving
the active token returns the agreement identity. Wyatt can revoke the link, after
which the token no longer resolves.

## Types

```types
external User
  A link owner or intended recipient.
external Item
  The item identified by a link.
LinkStatus is ACTIVE or REVOKED
  Whether the link can resolve.
```

## State

```state
a set of Links with
  an owner User
  an item Item
  an optional recipient User
  a unique token String
  a status LinkStatus

Rule: Tokens are unguessable, immutable, and never reused, including tokens belonging to revoked links.
```

## Actions

```actions
create(owner: User, item: Item, recipient?: User) : returns (link: Link, token: String)
  where true
  then
    add a new link with owner, item, recipient if supplied, a fresh unguessable token, and status ACTIVE
    bind token to the new link's token
    returns link, token

resolve(token: String) : returns (item: Item)
  where an active link has token
  then
    bind item to that link's item
    returns item
  where no active link has token
  then
    make no change
    refuses LINK_NOT_ACTIVE "That invitation link is not active."

revoke(user: User, link: Link) : returns ()
  where link exists with status ACTIVE, and user is its owner
  then
    set link's status to REVOKED
    returns
  where link does not exist or its status is REVOKED
  then
    make no change
    refuses LINK_NOT_ACTIVE "That invitation link is not active."
  where link exists with status ACTIVE, and user is not its owner
  then
    make no change
    refuses LINK_NOT_OWNER "Only the link owner can revoke it."
```

## Queries

```queries
_activeForItem(item: Item) : optional (link: Link, token: String)
  returns one active link for item without a designated recipient, ordered by link identity, or no row when none exists

_recipient(token: String, fallback: User) : optional (user: User)
  returns the active link's designated recipient or the supplied fallback when none was designated, or no row for an inactive or unknown token

_forRecipient(item: Item, recipient: User) : optional (link: Link, token: String)
  returns one active link with the exact item and designated recipient, ordered by link identity, or no row when none exists
```
