export interface Medicine {
    id: number;
    name: string;
    sku: string;
    price: number;
    stock: number;
}

export interface Order {
    id: number;
    medicine_id: number;
    quantity: number;
    status: 'pending' | 'completed' | 'cancelled';
    created_at: string;
}
