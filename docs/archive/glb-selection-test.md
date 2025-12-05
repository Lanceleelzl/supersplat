# GLB Model Selection Highlight Test

## Test Objective

Verify that GLB models show visual highlight/outline when selected from the list panel.

## Implementation Summary

### Changes Made

1. **Scene Config** (`src/scene-config.ts`):
   - Added `outlineSelection: true` to default show settings

2. **Main Initialization** (`src/main.ts`):
   - Added initialization of outline selection with `events.fire('view.setOutlineSelection', sceneConfig.show.outlineSelection)`

3. **GLB Model Enhancements** (`src/gltf-model.ts`):
   - Added `onPreRender()` method for bounding box visualization
   - Added imports for Mat4 and Color from PlayCanvas
   - Implemented wireframe bounding box rendering when model is selected

### Existing Infrastructure

1. **Outline System** (`src/outline.ts`):
   - Already supports GLB models with `addModelToOutlineLayer()` and `removeModelFromOutlineLayer()`
   - Handles `selection.changed` events for both Splat and GltfModel types
   - Recursively applies outline layer to model entities and children

2. **Selection Events**:
   - `selection.changed` event is fired when items are selected in UI panels
   - Outline system listens to these events and applies/removes highlight layers

3. **Color Configuration**:
   - Uses `selectedClr` from scene config (default: yellow `{r:1, g:1, b:0, a:1}`)
   - Outline shader renders highlight with configured selection color

## Expected Behavior

1. Load a GLB model into the scene
2. Select the model from the splat list panel
3. Model should appear with yellow outline/highlight in the viewport
4. When bounds are enabled, also show white wireframe bounding box
5. Deselecting should remove both outline and bounding box

## Technical Details

- Outline rendering uses a separate camera pass with special shader
- GLB models are added to overlay layer for outline rendering
- Outline shader creates edge detection effect around selected objects
- Bounding box rendering uses `drawLine()` calls in onPreRender
- Configured to work alongside existing splat selection system

## Verification Steps

1. Start development server: `npm run dev`
2. Load a GLB/GLTF model file
3. Click on the model name in the left panel to select it
4. Observe yellow outline around the model in the 3D viewport
5. Enable bounds view to see white wireframe bounding box
6. Click elsewhere to deselect and verify both effects disappear

## Implementation Features

- **Dual Visual Feedback**: Outline highlight + bounding box visualization
- **Consistent with Splats**: Same selection color and behavior patterns
- **Configurable**: Respects outline selection and bounds display settings
- **Performance Optimized**: Only renders highlights for selected models

## Fallback Options

If outline doesn't work as expected, alternative highlighting methods:

1. Bounding box visualization (already implemented)
2. Color tinting of model materials
3. Wireframe overlay rendering
4. Transparency/alpha modification for selection feedback