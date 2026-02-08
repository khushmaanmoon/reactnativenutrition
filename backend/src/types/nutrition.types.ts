export interface NutritionInput {
    age: number,
    gender: 'male' | 'female',
    height : number,
    weight : number,
    activityLevel : 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active' |,
    goal : 'fat_loss' | 'maintenance' | 'muscle_gain'
}

export interface NutritionResult {
    calories : number,
    protein : number,
    carbs : number,
    fats : number
}