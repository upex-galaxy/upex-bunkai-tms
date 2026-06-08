# BK-18 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

```
Scenario: Crear ATC con payload válido
Given un miembro autenticado del workspace
And una User Story US-100 en el module M-10 con acceptance criteria AC-1 y AC-2
When el usuario hace POST a /atcs con title "Login with valid email", module*id M-10, user*story*id US-100, acceptance*criterion_ids [AC-1], layer "UI", y 3 steps más 2 assertions
Then la API devuelve 201 con el nuevo ATC, sus steps y sus assertions
And el slug es "{module-slug}/{atc-id-padded}"
And se emite un event atc.created
```

```
Scenario: Rechazar ATC cuando las acceptance criteria pertenecen a una user story distinta
Given un miembro autenticado
And AC-9 pertenece a la user story US-200 (no a US-100)
When el usuario hace POST a /atcs con user*story*id US-100 y acceptance*criterion*ids [AC-9]
Then la API devuelve 422 con error code "ac*outside*user_story"
And no se inserta ninguna fila en atcs, atc*steps ni atc*assertions
```

```
Scenario: Rechazar ATC cuando el module no está en el project subtree de la user story
Given una User Story US-100 pertenece al project P-1
And el module M-99 pertenece al project P-2
When el usuario hace POST a /atcs con user*story*id US-100 y module_id M-99
Then la API devuelve 422 con error code "module*outside*project_subtree"
```

```
Scenario: Las posiciones de los steps deben ser estrictamente crecientes desde 1
Given un miembro autenticado
When el usuario hace POST a /atcs con steps en posiciones [1, 3, 2]
Then la API devuelve 422 con error code "steps*position*invalid"
And el response body lista las posiciones infractoras
```

```
Scenario: PATCH /atcs/{id} actualiza campos y reemplaza en cascada steps y assertions de forma atómica
Given un ATC existente en version 1 con 3 steps y 1 assertion
When el usuario hace PATCH a /atcs/{id} con un nuevo title y un array de reemplazo de 2 steps
Then la API devuelve 200 con version 2
And los steps y assertions viejos se eliminan en la misma transaction que los nuevos inserts
And se emite un event atc.updated con affected*test*ids
```

---
_Synced from Jira by sync-jira-issues_
