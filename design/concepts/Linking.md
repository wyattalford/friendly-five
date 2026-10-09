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
  The link owner.
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
  a unique token String
  a status LinkStatus

Rule: Tokens are unguessable, immutable, and never reused, including tokens belonging to revoked links.
```

## Actions

```actions
create(owner: User, item: Item) : returns (link: Link, token: String)
  where true
  then
    add a new link with owner, item, a fresh unguessable token, and status ACTIVE
    bind token to the new link's token
    returns link, token

resolve(token: String) : returns (item: Item)
  where an active link has token
  then
    bind item to that link's item
    returns item

revoke(user: User, link: Link) : returns ()
  where link exists with status ACTIVE, and user is its owner
  then
    set link's status to REVOKED
    returns
```

## Queries

```queries
```
