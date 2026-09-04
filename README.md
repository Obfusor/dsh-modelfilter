# DSH Model Filter

Adds a **Filter models…** search box to the DeepSeek Harness model picker.

It works in both places that use the built-in model menu:

- the `/model` popup
- the composer’s model selector

Filtering is case-insensitive and matches provider names, model names, and
visible model text. Spaces and punctuation are ignored for matching, so model
names can be searched regardless of how a provider formats them. The model
catalog is read dynamically from the current DSH UI; no model names are
hardcoded. Provider groups with no matching models are hidden. The filter is
purely presentational; selecting a model still uses the built-in DeepSeek
Harness selection flow.

## Install

After publishing this directory to a GitHub repository, install it with DSH:

```sh
dsh plugin --profile web add github:Obfusor/dsh-modelfilter
```

For local development, DSH supports installing a local checkout or packed
tarball:

```sh
dsh plugin --profile web add "/path/to/dsh-modelfilter"
```

The package declares both `dsh.bundle.patch` and `dsh.client.platform: web`,
so DSH adds the bundle layer and loads the browser half into the web client.

## Development

No npm dependencies are required. Run the self-contained test with:

```sh
node --test test/*.test.mjs
```

The plugin targets the model menu’s stable ARIA roles rather than private CSS
module class names, so it does not depend on generated class names. It also
uses a runtime compatibility guard: if a future DSH release removes the
provider-grouped menu structure, the plugin fails closed and reports one
diagnostic in the browser console instead of modifying unrelated menus.
