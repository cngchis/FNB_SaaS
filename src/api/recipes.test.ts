import { expect, it } from 'vitest'
import { recipeInputSchema, selectRecipe, type RecipeDTO } from './recipes'
const id = '00000000-0000-4000-8000-000000000001'
const recipe: RecipeDTO = { id, version: 1, unit: 'Ly', attributes: [], ingredients: [{ product_id: id, name: 'Sữa', sku: 'M1', base_unit: 'L', quantity: '0.125', cost_vnd: 20000 }] }
it('matches exact attributes before the default and never crosses sale units', () => {
 const large = { ...recipe, id: '00000000-0000-4000-8000-000000000002', attributes: [{ name: 'Size', value: 'L' }, { name: 'Ice', value: 'Less' }] }
 expect(selectRecipe([recipe, large], 'Ly', [...large.attributes].reverse())).toBe(large)
 expect(selectRecipe([recipe, large], 'Ly', [{ name: 'Size', value: 'M' }])).toBe(recipe)
 expect(selectRecipe([recipe], 'Bình', [])).toBeUndefined()
})
it('validates exact decimal ingredient input and rejects duplicate ingredients', () => {
 const input = { unit: 'Ly', version: 0, attributes: [], ingredients: [{ product_id: id, base_unit: 'L', quantity: '0.000001' }] }
 expect(recipeInputSchema.safeParse(input).success).toBe(true)
 for (const quantity of ['0', '-1', '1e3', '0.0000001', '1000000000.000001']) expect(recipeInputSchema.safeParse({ ...input, ingredients: [{ ...input.ingredients[0], quantity }] }).success).toBe(false)
 expect(recipeInputSchema.safeParse({ ...input, ingredients: [...input.ingredients, ...input.ingredients] }).success).toBe(false)
})
