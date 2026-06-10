# BK-18 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-18)

- acceptance*criterion*ids[] deben pertenecer todos al user*story*id provisto (cross-entity check)
- module_id debe ser igual al module de la user story O ser un module descendiente dentro del mismo project (subtree check)
- layer debe ser uno de {UI, API, Unit} — enum constraint a nivel de DB y de API
- las posiciones de steps[] deben ser enteros, estrictamente crecientes, comenzando en 1
- tags[] tiene longitud máxima 10; el title mide entre 3 y 200 caracteres; el contenido de step máximo 2KB Markdown
- el slug se computa una sola vez en la creación y es inmutable a través de las ediciones (los renombres no cambian el slug)
- el entero de version es monotónicamente creciente por ATC; el PATCH lo incrementa en 1

---
_Synced from Jira by sync-jira-issues_
