import { Module } from '@nestjs/common'

import { DBModule } from '../db/db.module'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { orderProviders } from './order.providers'

@Module({
    imports: [DBModule],
    controllers: [OrderController],
    providers: [...orderProviders, OrderService],
})
export class OrdersModule {}
