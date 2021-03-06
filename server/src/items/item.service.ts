import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'

import { ShortItem, Item } from './item.interface'
import { ItemEntity } from '../entity/item.entity'
import { CreateItemDto, UpdateItemDto } from './item.dto'

@Injectable()
export class ItemService {
    constructor(
        @Inject('ItemRepositoryToken')
        private readonly itemRepository: Repository<Item>
    ) {}

    async getAllItems(): Promise<Item[]> {
        try {
            return await this.itemRepository.find()
        } catch (err) {
            return err
        }
    }

    async getItem(item_id: string): Promise<ShortItem> {
        try {
            const item = await this.itemRepository.findOne({ item_id })

            if (!item) {
                throw new BadRequestException('Product not found')
            }

            const { item_name, price, items_in_stock } = item

            return { item_name, price, items_in_stock }
        } catch (err) {
            return err
        }
    }

    async createItem(param: CreateItemDto) {
        try {
            const item = new ItemEntity()
            const uuid = uuidv4()

            item.item_id = uuid
            item.item_name = param.item_name
            item.price = param.price
            item.items_in_stock = param.items_in_stock

            await this.itemRepository.save(item)

            return
        } catch (err) {
            return err
        }
    }

    async updateItem(param: UpdateItemDto) {
        try {
            const { item_id, price, items_in_stock } = param
            const item = await this.itemRepository.findOne({ item_id })

            if (!item) {
                throw new BadRequestException('Product not found')
            }

            item.price = price
            item.items_in_stock = items_in_stock

            await this.itemRepository.save(item)

            return
        } catch (err) {
            return err
        }
    }

    async deleteItem(item_id: string) {
        try {
            const item = await this.itemRepository.findOne({ item_id })

            if (!item) {
                throw new BadRequestException('Product not found')
            }

            await this.itemRepository.remove(item)

            return
        } catch (err) {
            return err
        }
    }
}
