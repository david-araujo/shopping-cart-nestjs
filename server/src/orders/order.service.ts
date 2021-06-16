import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { Repository } from 'typeorm'

import { Order } from './order.interface'

@Injectable()
export class OrderService {
    constructor(
        @Inject('OrderRepositoryToken')
        private readonly orderRepository: Repository<Order>
    ) {}

    async getAllOrders(): Promise<Order[]> {
        try {
            return await this.orderRepository.find()
        } catch (err) {
            return err
        }
    }

    async deleteOrder(order_id: string) {
        try {
            const order = await this.orderRepository.findOne({ order_id })

            if (!order) {
                throw new BadRequestException('Order not found')
            }

            await this.orderRepository.remove(order)

            return
        } catch (err) {
            return err
        }
    }
}
