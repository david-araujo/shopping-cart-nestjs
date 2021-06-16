import {
    Injectable,
    Inject,
    BadRequestException,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common'
import { Repository, Transaction, TransactionRepository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import * as _ from 'lodash'
import * as bcrypt from 'bcrypt'

import {
    User,
    ShortUser,
    ItemList,
    ItemListRow,
    ShortItemListRow,
    OrderList,
    OrderListRow,
} from './user.interface'
import { Item } from '../items/item.interface'
import { Order } from '../orders/order.interface'
import { ItemEntity } from '../entity/item.entity'
import { UserEntity } from '../entity/user.entity'
import { OrderEntity } from '../entity/order.entity'
import {
    CreateUserDto,
    UserLoginDto,
    UserDepositDto,
    UserAddItemDto,
    UserRemoveItemDto,
    UserCheckoutDto,
} from './user.dto'

@Injectable()
export class UserService {
    constructor(
        @Inject('UserRepositoryToken')
        private readonly userRepository: Repository<User>,
        @Inject('ItemRepositoryToken')
        private readonly itemRepository: Repository<Item>,
        @Inject('OrderRepositoryToken')
        private readonly orderRepository: Repository<Order>
    ) {}

    async getAllUsers(): Promise<User[]> {
        try {
            return await this.userRepository.find()
        } catch (err) {
            return err
        }
    }

    async getUser(user_id: string): Promise<ShortUser> {
        try {
            const user = await this.userRepository.findOne({ user_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            const {
                account,
                user_name,
                credit,
                created_time,
                last_login_time,
            } = user

            return { account, user_name, credit, created_time, last_login_time }
        } catch (err) {
            return err
        }
    }

    async getUserOrderList(user_id: string): Promise<OrderList> {
        try {
            const user = await this.userRepository.findOne({
                relations: ['orders'],
                where: { user_id },
            })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            const order_list = await Promise.all(
                user.orders.map(
                    async (obj): Promise<OrderListRow> => {
                        const { order_id, order_details, created_time } = obj
                        const { total, item_list } = await this.getItemList(
                            order_details
                        )

                        return {
                            order_id,
                            item_list,
                            created_time,
                            total,
                        }
                    }
                )
            )

            return {
                account: user.account,
                name: user.user_name,
                order_list,
            }
        } catch (err) {
            return err
        }
    }

    async getUserCart(user_id: string): Promise<ItemList> {
        try {
            const user = await this.userRepository.findOne({ user_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            return await this.getItemList(user.cart)
        } catch (err) {
            return err
        }
    }

    async getItemList(items: ShortItemListRow[]): Promise<ItemList> {
        try {
            if (items.length === 0) {
                return { total: 0, item_list: [] }
            }

            let total = 0
            const item_list = await Promise.all(
                items.map(
                    async (obj): Promise<ItemListRow> => {
                        const { item_id, amount } = obj
                        const item = await this.itemRepository.findOne({
                            item_id,
                        })
                        const subtotal = item.price * amount

                        total += subtotal

                        return {
                            item_id,
                            item_name: item.item_name,
                            item_price: item.price,
                            amount,
                            subtotal,
                        }
                    }
                )
            )

            return { total, item_list }
        } catch (err) {
            return err
        }
    }

    async createUser(param: CreateUserDto) {
        try {
            const duplicatedUser = await this.userRepository.findOne({
                account: param.account,
            })

            if (duplicatedUser) {
                throw new UnauthorizedException('Acount ready been used')
            }

            const user = new UserEntity()
            const now = parseInt(String(Date.now() / 1000), 10)
            const uuid = uuidv4()
            const saltRounds = 10

            user.user_id = uuid
            user.user_name = param.user_name
            user.account = param.account
            user.password = bcrypt.hashSync(param.password, saltRounds)
            user.credit = param.credit
            user.cart = []
            user.orders = []
            user.created_time = now
            user.last_login_time = now

            await this.userRepository.save(user)

            return
        } catch (err) {
            return err
        }
    }

    async login(param: UserLoginDto) {
        try {
            const { account, password } = param
            const user = await this.userRepository.findOne({ account })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            const passed = bcrypt.compareSync(password, user.password)

            if (!passed) {
                throw new UnauthorizedException('Invalid password')
            }

            const { user_id, user_name } = user

            return { user_id, user_name }
        } catch (err) {
            return err
        }
    }

    async deposit(param: UserDepositDto) {
        try {
            const { amount } = param
            const user = await this.userRepository.findOne({
                user_id: param.user_id,
            })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            const { user_id, user_name } = user

            user.credit += amount

            await this.userRepository.save(user)

            return { user_id, user_name }
        } catch (err) {
            return err
        }
    }

    @Transaction({ isolation: 'SERIALIZABLE' })
    async addItem(
        param: UserAddItemDto,
        @TransactionRepository(UserEntity) userRepository?: Repository<User>,
        @TransactionRepository(ItemEntity) itemRepository?: Repository<Item>
    ) {
        try {
            const { user_id, item_id, amount } = param
            const user = await userRepository.findOne({ user_id })
            const item = await itemRepository.findOne({ item_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            if (!item) {
                throw new BadRequestException('Product not found')
            }

            const duplicatedItem = _.find(user.cart, { item_id })

            if (amount > item.items_in_stock) {
                throw new UnauthorizedException('Insufficient product inventory')
            }

            if (duplicatedItem) {
                duplicatedItem.amount += amount
            } else {
                user.cart.push({ item_id, amount })
            }

            item.items_in_stock -= amount

            await userRepository.save(user)
            await itemRepository.save(item).then(null, () => {
                throw new ConflictException(
                    'could not serialize access due to concurrent update'
                )
            })

            return
        } catch (err) {
            return err
        }
    }

    @Transaction({ isolation: 'SERIALIZABLE' })
    async removeItem(
        param: UserRemoveItemDto,
        @TransactionRepository(UserEntity) userRepository?: Repository<User>,
        @TransactionRepository(ItemEntity) itemRepository?: Repository<Item>
    ) {
        try {
            const { user_id, item_id } = param
            const user = await userRepository.findOne({ user_id })
            const item = await itemRepository.findOne({ item_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            if (!item) {
                throw new BadRequestException('Product not found')
            }

            const removeItem = _.find(user.cart, cv => cv.item_id === item_id)

            if (!removeItem) {
                throw new BadRequestException('Item not found')
            }

            _.remove(user.cart, cv => cv.item_id === item_id)

            item.items_in_stock += removeItem.amount

            await userRepository.save(user)
            await itemRepository.save(item).then(null, () => {
                throw new ConflictException(
                    'could not serialize access due to concurrent update'
                )
            })

            return
        } catch (err) {
            return err
        }
    }

    async checkout(param: UserCheckoutDto) {
        try {
            const { user_id } = param
            const user = await this.userRepository.findOne({ user_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            if (user.cart.length === 0) {
                throw new BadRequestException('Shopping cart empty')
            }

            const itemList = await this.getItemList(user.cart)

            if (itemList.total > user.credit) {
                throw new UnauthorizedException(
                    'Not enough to pay'
                )
            }

            const order = new OrderEntity()
            const now = parseInt(String(Date.now() / 1000), 10)
            const uuid = uuidv4()

            order.order_id = uuid
            order.order_details = user.cart
            order.created_time = now

            user.credit -= itemList.total
            user.cart = []

            order.user = user

            await this.orderRepository.save(order)
            await this.userRepository.save(user)

            return
        } catch (err) {
            return err
        }
    }

    async deleteUser(user_id: string) {
        try {
            const user = await this.userRepository.findOne({ user_id })

            if (!user) {
                throw new BadRequestException('User not found')
            }

            await this.userRepository.remove(user)

            return
        } catch (err) {
            return err
        }
    }
}
